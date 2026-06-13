import re
import math
import uuid
import time
import io
import json
import pandas as pd
import numpy as np
import psycopg2
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from OnlineLLM import client, MODEL_NAME

app = FastAPI(
    title="Customer Feedback BI API",
    description="Backend API to process feedback CSVs and fetch customer feedback analytics",
    version="2.0.0"
)

# Enable CORS (Cross-Origin Resource Sharing) to allow Frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for local development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db_connection():
    """
    Dynamically parses database connection parameters from Connectdb.py 
    and establishes a fresh connection. This prevents connection dropouts.
    """
    connect_file = "Connectdb.py"
    try:
        with open(connect_file, "r", encoding="utf-8") as f:
            content = f.read()
        
        host = re.search(r'host\s*=\s*["\'](.*?)["\']', content).group(1)
        user = re.search(r'user\s*=\s*["\'](.*?)["\']', content).group(1)
        password = re.search(r'password\s*=\s*["\'](.*?)["\']', content).group(1)
        port = re.search(r'port\s*=\s*["\'](.*?)["\']', content).group(1)
        database = re.search(r'database\s*=\s*["\'](.*?)["\']', content).group(1)
        
        return psycopg2.connect(
            host=host,
            user=user,
            password=password,
            port=port,
            database=database
        )
    except Exception as e:
        raise RuntimeError(f"Database configuration parse error: {e}")

# ----------------------------------------------------------------------
# Preprocessing Logic (matching Preprocessing.py)
# ----------------------------------------------------------------------
def is_meaningful(text):
    if pd.isna(text):
        return False
    
    text = str(text).strip().lower()
    
    # Remove empty, short, or generic noise
    if text == "" or len(text) < 5:
        return False
    
    # Remove repeated characters like "oooo", "cooome"
    text = re.sub(r'(.)\1{2,}', r'\1', text)
    
    # Remove meaningless patterns
    meaningless_patterns = [
        r'^\W+$',           # only symbols
        r'^(ok|fine|good)$' # too generic
    ]
    
    for pattern in meaningless_patterns:
        if re.match(pattern, text):
            return False
    
    return True

def parse_date(date):
    try:
        return pd.to_datetime(date, errors='coerce')
    except:
        return np.nan

def clean_text(text):
    text = str(text).lower()
    
    # Remove extra spaces
    text = re.sub(r'\s+', ' ', text)
    
    # Remove order IDs
    text = re.sub(r'\(order.*?\)', '', text)
    
    # Remove special characters
    text = re.sub(r'[^\w\s]', '', text)
    
    return text.strip()

def preprocess_csv_data(df: pd.DataFrame) -> pd.DataFrame:
    # Standardize column names
    df.columns = df.columns.str.strip().str.lower()
    
    # Verify required columns
    required_cols = {'id', 'timestamp', 'source', 'rating', 'feedback_text'}
    missing = required_cols - set(df.columns)
    if missing:
        raise ValueError(f"Missing required columns: {', '.join(missing)}")
    
    # Clean ID
    df['id'] = pd.to_numeric(df['id'], errors='coerce')
    df = df.dropna(subset=['id'])
    df['id'] = df['id'].astype(int)
        
    df['feedback_text'] = df['feedback_text'].astype(str).str.strip().str.lower()
    
    df = df.drop_duplicates(subset=['feedback_text'])
    df = df[df['feedback_text'].apply(is_meaningful)]
    
    df['timestamp'] = df['timestamp'].apply(parse_date)
    df = df.dropna(subset=['timestamp'])
    df['timestamp'] = df['timestamp'].dt.strftime('%Y-%m-%d')
    
    df['feedback_text'] = df['feedback_text'].apply(clean_text)
    
    clean_df = df[['id', 'timestamp', 'source', 'rating', 'feedback_text']]
    clean_df = clean_df.sort_values(by='timestamp')
    clean_df.reset_index(drop=True, inplace=True)
    return clean_df

# ----------------------------------------------------------------------
# LLM Analysis Logic
# ----------------------------------------------------------------------
def create_prompt(feedback):
    return f"""[INST] You are a professional customer feedback analysis AI.
Analyze the customer feedback message below and extract three structured attributes:
1. "sentiment": Must be exactly "Positive", "Negative", or "Neutral"
2. "category": Must be exactly one of: "Billing", "App Bug", "Delivery", "Staff/Support", "Other"
3. "summary": A concise, one-line summary of the core issue.

Respond ONLY with a valid JSON object. Do not include markdown formatting, backticks, or any other explanations.

Format:
{{
  "sentiment": "sentiment_here",
  "category": "category_here",
  "summary": "summary_text_here"
}}

Feedback:
"{feedback}" [/INST]"""

def get_response_content(response) -> str:
    message = response.choices[0].message
    content = getattr(message, 'content', None)
    if content is None:
        refusal = getattr(message, 'refusal', None)
        raise ValueError(f"API returned empty content. Refusal: {refusal}")
    return content.strip()

def analyze_feedback(text):
    prompt = create_prompt(text)
    max_retries = 5
    base_delay = 2.0
    
    response_text = ""
    for attempt in range(max_retries):
        try:
            time.sleep(0.5)  # Proactive sleep to avoid OpenRouter limits
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                max_tokens=100,
                temperature=0.1
            )
            response_text = get_response_content(response)
            break
        except Exception as e:
            delay = base_delay * (2 ** attempt)
            # Avoid emojis in print to prevent UnicodeEncodeError in Windows consoles
            print(f"[WARNING] API query failed: {e}. Retrying in {delay:.1f}s (Attempt {attempt+1}/{max_retries})...")
            time.sleep(delay)
    else:
        print(f"[ERROR] Failed to query API after {max_retries} attempts.")
        return {
            "sentiment": "Unknown",
            "category": "Other",
            "summary": "API query failure"
        }
    
    result = None
    try:
        match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if match:
            json_str = match.group(0)
            result = json.loads(json_str)
        else:
            result = json.loads(response_text)
    except Exception as e:
        print(f"[WARNING] JSON Parse Failed: '{response_text}'. Error: {e}")
        result = {
            "sentiment": "Neutral",
            "category": "Other",
            "summary": response_text.replace("\n", " ")[:100]
        }

    # Normalize Sentiment
    sentiment = str(result.get("sentiment", "Neutral")).strip().capitalize()
    if sentiment not in ["Positive", "Negative", "Neutral"]:
        if "pos" in sentiment.lower():
            sentiment = "Positive"
        elif "neg" in sentiment.lower():
            sentiment = "Negative"
        else:
            sentiment = "Neutral"

    # Normalize Category
    category = str(result.get("category", "Other")).strip()
    valid_categories = {
        "billing": "Billing",
        "app bug": "App Bug",
        "appbug": "App Bug",
        "bug": "App Bug",
        "delivery": "Delivery",
        "staff/support": "Staff/Support",
        "staff": "Staff/Support",
        "support": "Staff/Support",
        "other": "Other"
    }
    category_lower = category.lower()
    matched_category = "Other"
    for key, val in valid_categories.items():
        if key in category_lower:
            matched_category = val
            break

    # Clean Summary
    summary = str(result.get("summary", "")).strip().replace("\n", " ")
    if not summary:
        summary = "No summary provided"

    return {
        "sentiment": sentiment,
        "category": matched_category,
        "summary": summary
    }

# ----------------------------------------------------------------------
# Background Task
# ----------------------------------------------------------------------
def background_process_batch(batch_id: str, df_records: list):
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Prefetch existing records to avoid redundant LLM calls
        cursor.execute("SELECT id FROM analyzed_feedback;")
        existing_ids = {row[0] for row in cursor.fetchall()}
        
        is_stopped = False
        for record in df_records:
            # Check status before processing the next row
            cursor.execute("SELECT status FROM batches WHERE batch_id = %s;", (batch_id,))
            status_row = cursor.fetchone()
            if status_row and status_row[0] == 'stopped':
                print(f"[INFO] Batch processing stopped by user for {batch_id}")
                is_stopped = True
                break
                
            row_id = int(record['id'])
            timestamp_val = str(record['timestamp'])
            source_val = str(record['source'])
            
            rating_val = record['rating']
            if pd.isna(rating_val) or (isinstance(rating_val, float) and math.isnan(rating_val)):
                rating_val = None
            else:
                rating_val = float(rating_val)
                
            feedback_text = str(record['feedback_text'])
            
            if row_id in existing_ids:
                # Update batch_id & text parameters for existing row
                update_query = """
                UPDATE analyzed_feedback 
                SET batch_id = %s, timestamp = %s, source = %s, rating = %s, feedback_text = %s 
                WHERE id = %s;
                """
                cursor.execute(update_query, (batch_id, timestamp_val, source_val, rating_val, feedback_text, row_id))
            else:
                # Run LLM analysis
                analysis = analyze_feedback(feedback_text)
                
                # Insert new record
                insert_query = """
                INSERT INTO analyzed_feedback (id, timestamp, source, rating, feedback_text, sentiment, category, summary, batch_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO NOTHING;
                """
                cursor.execute(insert_query, (
                    row_id,
                    timestamp_val,
                    source_val,
                    rating_val,
                    feedback_text,
                    analysis["sentiment"],
                    analysis["category"],
                    analysis["summary"],
                    batch_id
                ))
            
            # Commit incrementally for safety (no data-loss on interruption)
            conn.commit()
            
        if not is_stopped:
            # Complete batch successfully
            cursor.execute("UPDATE batches SET status = 'completed' WHERE batch_id = %s;", (batch_id,))
            conn.commit()
            
            # Build vector index for FAISS RAG
            try:
                build_vector_index_for_batch(batch_id)
            except Exception as index_err:
                print(f"[WARNING] Failed to build vector index for batch {batch_id}: {index_err}")
        
    except Exception as e:
        print(f"[ERROR] Batch worker failed for {batch_id}: {e}")
        if conn:
            try:
                cursor = conn.cursor()
                cursor.execute("UPDATE batches SET status = 'failed' WHERE batch_id = %s;", (batch_id,))
                conn.commit()
            except Exception as db_err:
                print(f"[ERROR] Failed to set status to failed: {db_err}")
    finally:
        if conn:
            cursor.close()
            conn.close()

# ----------------------------------------------------------------------
# API Endpoints
# ----------------------------------------------------------------------
@app.get("/")
def home():
    return {
        "status": "online",
        "message": "BI Dashboard API is running successfully",
        "docs_url": "/docs"
    }

@app.get("/api/categories")
def get_top_categories():
    """
    Fetches the list of overall feedback categories grouped by count.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        query = """
        SELECT category, COUNT(*) as count 
        FROM analyzed_feedback 
        GROUP BY category 
        ORDER BY count DESC;
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        categories_data = [{"category": row[0], "count": row[1]} for row in rows]
        return categories_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch category counts: {e}")

@app.get("/api/sentiment")
def get_sentiment_breakdown():
    """
    Fetches the overall sentiment counts and calculates percentages dynamically.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        query = """
        SELECT sentiment, COUNT(*) as count 
        FROM analyzed_feedback 
        GROUP BY sentiment 
        ORDER BY count DESC;
        """
        cursor.execute(query)
        rows = cursor.fetchall()
        
        cursor.close()
        conn.close()
        
        total_count = sum(row[1] for row in rows)
        sentiment_order = ["Negative", "Neutral", "Positive"]
        sentiment_map = {row[0]: row[1] for row in rows}
        
        sentiment_data = []
        for sentiment in sentiment_order:
            count = sentiment_map.get(sentiment, 0)
            percentage = (count / total_count * 100) if total_count > 0 else 0.0
            sentiment_data.append({
                "sentiment": sentiment,
                "count": count,
                "percentage": f"{percentage:.0f}%"
            })
            
        return sentiment_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch sentiment breakdown: {e}")

@app.get("/api/examples")
def get_representative_examples():
    """
    Fetches 2-3 representative example messages for each top category from the entire database.
    Prioritizes negative feedback, falling back to other sentiments if needed.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        categories = ["Delivery", "App Bug", "Billing", "Staff/Support"]
        examples_data = {}
        
        for cat in categories:
            # Query negative feedback
            query_neg = """
            SELECT feedback_text 
            FROM analyzed_feedback 
            WHERE category = %s AND sentiment = 'Negative' 
            LIMIT 3;
            """
            cursor.execute(query_neg, (cat,))
            rows = cursor.fetchall()
            
            # Fallback if less than 3
            if len(rows) < 3:
                needed = 3 - len(rows)
                query_fallback = """
                SELECT feedback_text 
                FROM analyzed_feedback 
                WHERE category = %s AND sentiment != 'Negative' 
                LIMIT %s;
                """
                cursor.execute(query_fallback, (cat, needed))
                fallback_rows = cursor.fetchall()
                rows.extend(fallback_rows)
                
            examples_data[cat] = [row[0] for row in rows]
            
        cursor.close()
        conn.close()
        return examples_data
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch representative examples: {e}")

@app.post("/api/upload")
async def upload_csv(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    """
    Accepts feedback CSV file, cleans it, initializes batch tracking, 
    and spawns a background analysis worker.
    """
    try:
        content = await file.read()
        try:
            content_str = content.decode("utf-8")
        except UnicodeDecodeError:
            try:
                content_str = content.decode("latin1")
            except UnicodeDecodeError:
                content_str = content.decode("cp1252", errors="ignore")
                
        df = pd.read_csv(io.StringIO(content_str))
        
        # Preprocess the dataframe
        try:
            clean_df = preprocess_csv_data(df)
        except ValueError as val_err:
            raise HTTPException(status_code=400, detail=str(val_err))
            
        total_rows = len(clean_df)
        if total_rows == 0:
            raise HTTPException(status_code=400, detail="The file contains no valid rows after preprocessing.")
            
        # Create a unique batch ID
        batch_id = f"batch_{int(time.time())}_{uuid.uuid4().hex[:4]}"
        
        # Insert batch into PostgreSQL
        conn = get_db_connection()
        cursor = conn.cursor()
        
        insert_batch_query = """
        INSERT INTO batches (batch_id, filename, total_rows, status) 
        VALUES (%s, %s, %s, %s);
        """
        cursor.execute(insert_batch_query, (batch_id, file.filename, total_rows, 'processing'))
        conn.commit()
        cursor.close()
        conn.close()
        
        # Convert records to dictionary format for the background task
        df_records = clean_df.to_dict(orient="records")
        
        # Schedule the background worker
        background_tasks.add_task(background_process_batch, batch_id, df_records)
        
        return {
            "batch_id": batch_id,
            "total_rows": total_rows,
            "filename": file.filename,
            "message": "Upload successful. Background analysis started."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"An error occurred while uploading/processing CSV: {e}")

@app.get("/api/batches")
def get_batches():
    """
    Retrieves all historical run metadata and calculates processed rows dynamically.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT batch_id, uploaded_at, filename, total_rows, status 
            FROM batches 
            ORDER BY uploaded_at DESC;
        """)
        rows = cursor.fetchall()
        
        batches = []
        for row in rows:
            b_id, uploaded_at, filename, total_rows, status = row
            
            # Count processed rows for this specific batch
            cursor.execute("SELECT COUNT(*) FROM analyzed_feedback WHERE batch_id = %s;", (b_id,))
            processed_rows = cursor.fetchone()[0]
            
            date_str = uploaded_at.strftime('%Y-%m-%d %H:%M:%S') if uploaded_at else None
            
            batches.append({
                "batch_id": b_id,
                "uploaded_at": date_str,
                "filename": filename,
                "total_rows": total_rows,
                "status": status,
                "processed_rows": processed_rows
            })
            
        cursor.close()
        conn.close()
        return batches
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch batches: {e}")

@app.get("/api/batch/{batch_id}")
def get_batch_progress(batch_id: str):
    """
    Retrieves the processing progress of a single batch.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT batch_id, filename, total_rows, status 
            FROM batches 
            WHERE batch_id = %s;
        """, (batch_id,))
        row = cursor.fetchone()
        
        if not row:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Batch not found")
            
        b_id, filename, total_rows, status = row
        
        # Count processed rows
        cursor.execute("SELECT COUNT(*) FROM analyzed_feedback WHERE batch_id = %s;", (b_id,))
        processed_rows = cursor.fetchone()[0]
        
        cursor.close()
        conn.close()
        
        return {
            "batch_id": b_id,
            "filename": filename,
            "total_rows": total_rows,
            "processed_rows": processed_rows,
            "status": status
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch batch progress: {e}")

@app.post("/api/batch/{batch_id}/stop")
def stop_batch_processing(batch_id: str):
    """
    Stops an active batch processing run by setting its database status to 'stopped'.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Verify batch exists and is in 'processing' status
        cursor.execute("SELECT status FROM batches WHERE batch_id = %s;", (batch_id,))
        row = cursor.fetchone()
        
        if not row:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Batch not found")
            
        status = row[0]
        if status != "processing":
            cursor.close()
            conn.close()
            raise HTTPException(status_code=400, detail=f"Batch is not actively processing (current status: {status})")
            
        # Update status to stopped
        cursor.execute("UPDATE batches SET status = 'stopped' WHERE batch_id = %s;", (batch_id,))
        conn.commit()
        
        cursor.close()
        conn.close()
        
        return {
            "batch_id": batch_id,
            "status": "stopped",
            "message": "Stop request registered. Worker will abort shortly."
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to stop batch processing: {e}")

@app.get("/api/batch/{batch_id}/results")
def get_batch_results(batch_id: str):
    """
    Retrieves complete analytics summary and detailed records for a specific completed batch.
    """
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Verify batch exists
        cursor.execute("""
            SELECT batch_id, filename, total_rows, status, uploaded_at 
            FROM batches 
            WHERE batch_id = %s;
        """, (batch_id,))
        batch_row = cursor.fetchone()
        
        if not batch_row:
            cursor.close()
            conn.close()
            raise HTTPException(status_code=404, detail="Batch not found")
            
        b_id, filename, total_rows, status, uploaded_at = batch_row
        date_str = uploaded_at.strftime('%Y-%m-%d %H:%M:%S') if uploaded_at else None
        
        # Get all records for this batch
        cursor.execute("""
            SELECT id, timestamp, source, rating, feedback_text, sentiment, category, summary 
            FROM analyzed_feedback 
            WHERE batch_id = %s 
            ORDER BY id;
        """, (batch_id,))
        records_rows = cursor.fetchall()
        
        records = []
        for row in records_rows:
            records.append({
                "id": row[0],
                "timestamp": row[1],
                "source": row[2],
                "rating": row[3],
                "feedback_text": row[4],
                "sentiment": row[5],
                "category": row[6],
                "summary": row[7]
            })
            
        total_records = len(records)
        
        # Compute sentiment breakdown
        sentiment_counts = {}
        for r in records:
            sent = r["sentiment"]
            sentiment_counts[sent] = sentiment_counts.get(sent, 0) + 1
            
        sentiment_order = ["Negative", "Neutral", "Positive"]
        sentiment_breakdown = []
        for sent in sentiment_order:
            count = sentiment_counts.get(sent, 0)
            pct = (count / total_records * 100) if total_records > 0 else 0.0
            sentiment_breakdown.append({
                "sentiment": sent,
                "count": count,
                "percentage": f"{pct:.0f}%"
            })
            
        # Compute category breakdown
        category_counts = {}
        for r in records:
            cat = r["category"]
            category_counts[cat] = category_counts.get(cat, 0) + 1
            
        category_order = ["Delivery", "App Bug", "Billing", "Staff/Support", "Other"]
        category_breakdown = []
        for cat in category_order:
            category_breakdown.append({
                "category": cat,
                "count": category_counts.get(cat, 0)
            })
        category_breakdown.sort(key=lambda x: x["count"], reverse=True)
        
        # Compute example comments (up to 3 for main categories)
        examples = {}
        for cat in ["Delivery", "Billing", "App Bug", "Staff/Support"]:
            # Filter records in category with negative sentiment first
            cat_neg = [r["feedback_text"] for r in records if r["category"] == cat and r["sentiment"] == "Negative"]
            if not cat_neg:
                # Fallback to any comments
                cat_neg = [r["feedback_text"] for r in records if r["category"] == cat]
            examples[cat] = cat_neg[:3]
            
        cursor.close()
        conn.close()
        
        return {
            "summary": {
                "batch_id": b_id,
                "filename": filename,
                "total_rows": total_rows,
                "processed_rows": total_records,
                "status": status,
                "uploaded_at": date_str
            },
            "sentiment_breakdown": sentiment_breakdown,
            "category_breakdown": category_breakdown,
            "examples": examples,
            "records": records
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch batch results: {e}")

# ----------------------------------------------------------------------
# AI Agentic Chat Helper Functions & Endpoint
# ----------------------------------------------------------------------
class ChatRequest(BaseModel):
    message: str

def generate_sql_for_batch(batch_id: str, user_query: str) -> str:
    prompt = f"""You are a professional PostgreSQL database analyst.
Write a read-only SQL query to retrieve data from the `analyzed_feedback` table based on the user request.

Table Name: analyzed_feedback
Table Schema:
- id (INT, Primary Key)
- timestamp (VARCHAR(50), format: YYYY-MM-DD)
- source (VARCHAR(100))
- rating (FLOAT, can be NULL)
- feedback_text (TEXT)
- sentiment (VARCHAR(50), values: 'Positive', 'Negative', 'Neutral')
- category (VARCHAR(100), values: 'Billing', 'App Bug', 'Delivery', 'Staff/Support', 'Other')
- summary (TEXT)
- batch_id (VARCHAR(50))

CRITICAL CONSTRAINTS:
1. You MUST always restrict the query to the current batch by including `batch_id = '{batch_id}'` in the WHERE clause.
2. The user might ask for time ranges. The `timestamp` column stores string dates like '2026-06-13'. To filter by dates, cast to date using `timestamp::date`. E.g., for the last 7 days, use `timestamp::date >= CURRENT_DATE - INTERVAL '7 days'`.
3. Return ONLY the raw SQL query. Do not include markdown formatting, backticks, or any explanations. Just return the SQL string itself so it can be executed directly.

User Request: "{user_query}"
SQL Query:"""

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "user", "content": prompt}
            ],
            max_tokens=200,
            temperature=0.1
        )
        sql_query = get_response_content(response)
        # Clean any markdown formatting
        sql_query = re.sub(r'```sql\s*', '', sql_query)
        sql_query = re.sub(r'```\s*', '', sql_query)
        return sql_query
    except Exception as e:
        print(f"[ERROR] SQL generation failed: {e}")
        return ""

def is_safe_query(query: str) -> bool:
    cleaned = query.strip().upper()
    if not cleaned.startswith("SELECT"):
        return False
    # Check for mutation actions
    forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "RENAME", "GRANT", "REVOKE"]
    for keyword in forbidden:
        if re.search(r'\b' + keyword + r'\b', cleaned):
            return False
    return True

def summarize_results(user_query: str, sql_query: str, results: list, column_names: list) -> str:
    # Format the results as markdown table for the LLM context
    results_text = ""
    if not results:
        results_text = "No records returned."
    else:
        results_text += " | ".join(column_names) + "\n"
        results_text += "---|" * len(column_names) + "\n"
        for row in results[:30]:
            row_str = " | ".join(str(val) for val in row)
            results_text += row_str + "\n"
        if len(results) > 30:
            results_text += f"... (and {len(results) - 30} more rows)\n"

    prompt = f"""You are a professional customer feedback analyst assistant.
The user asked: "{user_query}"
We generated and ran the following SQL query to retrieve relevant feedback:
{sql_query}

The database returned the following results:
{results_text}

Summarize these results for the user. Address their query directly, mention key insights or count of rows, and format the response in a friendly and professional markdown style. Keep it concise (1-2 paragraphs max).
"""

    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[
                {"role": "user", "content": prompt}
            ],
            max_tokens=300,
            temperature=0.3
        )
        return get_response_content(response)
    except Exception as e:
        return f"Query executed successfully, but failed to summarize: {e}"

EMBEDDING_MODEL = None

def get_embedding_model():
    global EMBEDDING_MODEL
    if EMBEDDING_MODEL is None:
        from sentence_transformers import SentenceTransformer
        print("[INFO] Loading SentenceTransformer model ('all-MiniLM-L6-v2')...")
        EMBEDDING_MODEL = SentenceTransformer("all-MiniLM-L6-v2")
        print("[SUCCESS] SentenceTransformer model loaded.")
    return EMBEDDING_MODEL

def build_vector_index_for_batch(batch_id: str):
    """
    Fetches all processed rows for batch_id from the database,
    generates embeddings, builds the FAISS index, and saves it.
    """
    import os
    import json
    import numpy as np
    import faiss
    
    os.makedirs("vector_indices", exist_ok=True)
    
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, timestamp, source, rating, feedback_text, sentiment, category, summary 
        FROM analyzed_feedback 
        WHERE batch_id = %s 
        ORDER BY id;
    """, (batch_id,))
    rows = cursor.fetchall()
    
    column_names = [desc[0] for desc in cursor.description]
    cursor.close()
    conn.close()
    
    if not rows:
        print(f"[WARNING] No feedback rows found in database for batch {batch_id}.")
        return
        
    records = [dict(zip(column_names, row)) for row in rows]
    texts = [r["feedback_text"] for r in records]
    
    model = get_embedding_model()
    embeddings = model.encode(texts, show_progress_bar=False)
    
    # Normalize for cosine similarity
    embeddings = np.array(embeddings).astype("float32")
    faiss.normalize_L2(embeddings)
    
    dimension = embeddings.shape[1]
    index = faiss.IndexFlatIP(dimension)
    index.add(embeddings)
    
    index_path = f"vector_indices/{batch_id}.index"
    meta_path = f"vector_indices/{batch_id}.json"
    
    faiss.write_index(index, index_path)
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2)
        
    print(f"[SUCCESS] Vector index built for batch {batch_id} with {len(records)} records.")

def retrieve_similar_feedback(batch_id: str, query: str, top_k: int = 8) -> list:
    """
    Given a batch_id and a user query, embeds the query, queries the FAISS index,
    and returns the top_k matching records from that batch.
    """
    import os
    import json
    import faiss
    
    index_path = f"vector_indices/{batch_id}.index"
    meta_path = f"vector_indices/{batch_id}.json"
    
    # Build on-the-fly if missing (e.g. for historical runs)
    if not os.path.exists(index_path) or not os.path.exists(meta_path):
        print(f"[INFO] Vector index for batch {batch_id} not found. Building now...")
        build_vector_index_for_batch(batch_id)
        
    if not os.path.exists(index_path) or not os.path.exists(meta_path):
        return []
        
    index = faiss.read_index(index_path)
    with open(meta_path, "r", encoding="utf-8") as f:
        metadata = json.load(f)
        
    if not metadata:
        return []
        
    model = get_embedding_model()
    query_vector = model.encode([query])
    faiss.normalize_L2(query_vector)
    
    distances, indices = index.search(query_vector, min(top_k, len(metadata)))
    
    results = []
    for dist, idx in zip(distances[0], indices[0]):
        if idx < 0 or idx >= len(metadata):
            continue
        item = metadata[idx]
        item_copy = dict(item)
        item_copy["similarity"] = float(dist)
        results.append(item_copy)
        
    return results

def classify_chat_intent(user_query: str) -> str:
    """
    Classifies if the query should be answered using standard SQL filters
    or requires semantic text search (RAG).
    """
    prompt = f"""You are a database query routing assistant.
Decide if the user's question should be answered using:
1. SQL: For specific queries asking for counts, listings, filtering by sentiment, category, rating, source, or timestamp (e.g. "show negative delivery reviews from yesterday", "how many Positive ratings in Billing?", "list reviews for support category").
2. RAG: For general, open-ended, semantic, or conceptual questions where exact SQL column filters or text matching are not enough (e.g. "are people complaining about late deliveries?", "what are the most common complaints about billing?", "what are people saying about support staff?").

Respond with exactly one word: 'SQL' or 'RAG'. Do not write any other explanation or markdown.

User Question: "{user_query}"
Class:"""
    try:
        response = client.chat.completions.create(
            model=MODEL_NAME,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=10,
            temperature=0.0
        )
        classification = get_response_content(response).strip().upper()
        if "SQL" in classification:
            return "SQL"
        return "RAG"
    except Exception as e:
        print(f"[ERROR] Chat intent classification failed: {e}. Defaulting to SQL.")
        return "SQL"

@app.post("/api/batch/{batch_id}/chat")
def chat_with_batch(batch_id: str, request: ChatRequest):
    """
    Agentic chat endpoint that routes queries between structured SQL
    and semantic RAG using FAISS, depending on query intent and results.
    """
    user_query = request.message
    
    # 1. Classify the user query intent
    intent = classify_chat_intent(user_query)
    print(f"[CHAT] Query classified as: {intent}")
    
    use_rag = (intent == "RAG")
    sql_query = None
    results = []
    column_names = []
    
    if not use_rag:
        # Generate SQL
        sql_query = generate_sql_for_batch(batch_id, user_query)
        if not sql_query or not is_safe_query(sql_query):
            print(f"[CHAT] SQL generation failed or is unsafe. Falling back to RAG.")
            use_rag = True
        else:
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                cursor.execute(sql_query)
                results_raw = cursor.fetchall()
                column_names = [desc[0] for desc in cursor.description]
                cursor.close()
                conn.close()
                
                # If SQL query returned 0 rows, fall back to RAG!
                if not results_raw:
                    print(f"[CHAT] SQL query returned 0 rows. Falling back to RAG.")
                    use_rag = True
                else:
                    results = [dict(zip(column_names, r)) for r in results_raw]
                    # Summarize results from SQL
                    summary = summarize_results(user_query, sql_query, results_raw, column_names)
            except Exception as e:
                print(f"[CHAT] SQL execution failed: {e}. Falling back to RAG.")
                use_rag = True

    if use_rag:
        # Perform similarity search using FAISS
        try:
            results = retrieve_similar_feedback(batch_id, user_query, top_k=8)
        except Exception as e:
            print(f"[ERROR] RAG retrieval failed: {e}")
            raise HTTPException(status_code=500, detail=f"RAG retrieval failed: {e}")
            
        # Format matched records for context
        if not results:
            summary = "I couldn't find any relevant feedback records matching your query in this batch."
        else:
            context_messages = []
            for idx, r in enumerate(results):
                msg_info = f"[{idx+1}] Text: {r['feedback_text']} | Category: {r['category']} | Sentiment: {r['sentiment']} | Date: {r['timestamp']}"
                context_messages.append(msg_info)
                
            context_text = "\n".join(context_messages)
            
            rag_prompt = f"""You are a professional customer feedback analyst assistant.
Here are some real customer messages:
{context_text}

Based on these, answer the user's question: "{user_query}"
Answer using actual real feedback details instead of guessing. Keep it concise (1-2 paragraphs max). Format in a friendly, professional markdown style.
"""
            try:
                response = client.chat.completions.create(
                    model=MODEL_NAME,
                    messages=[{"role": "user", "content": rag_prompt}],
                    max_tokens=300,
                    temperature=0.3
                )
                summary = get_response_content(response)
            except Exception as e:
                raise HTTPException(status_code=500, detail=f"Failed to generate answer from context: {e}")
                
        return {
            "sql": None,
            "total_results": len(results),
            "results": results[:100],
            "summary": summary
        }
        
    else:
        return {
            "sql": sql_query,
            "total_results": len(results),
            "results": results[:100],
            "summary": summary
        }