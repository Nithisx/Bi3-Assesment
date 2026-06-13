import os
import re
import json
import time
import pandas as pd
from OnlineLLM import client, MODEL_NAME

# Constants
INPUT_FILE = "clean_feedback.csv"
OUTPUT_FILE = "analyzed_feedback.csv"
REPORT_FILE = "business_report.md"
SAVE_INTERVAL = 1

def create_prompt(feedback):
    """
    Constructs the prompt for the Mistral 7B model.
    Note: We do not add the <s> token manually since llama_cpp adds it.
    """
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
    """
    Queries the Online OpenRouter LLM with retry/backoff logic to avoid hitting limits.
    Parses the response to get sentiment, category, and summary.
    """
    prompt = create_prompt(text)
    max_retries = 5
    base_delay = 2.0  # seconds to wait, escalates exponentially
    
    response_text = ""
    for attempt in range(max_retries):
        try:
            # Enforce a small baseline delay between API calls to proactively respect limits
            time.sleep(0.5)
            
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=[
                    {"role": "user", "content": prompt}
                ],
                max_tokens=100,
                temperature=0.1
            )
            response_text = get_response_content(response)
            break  # Success! Break out of the retry loop
        except Exception as e:
            delay = base_delay * (2 ** attempt)
            print(f"  [WARNING] API request failed: {e}. Retrying in {delay:.1f}s (Attempt {attempt+1}/{max_retries})...")
            time.sleep(delay)
    else:
        print(f"  [ERROR] Failed to query API after {max_retries} attempts.")
        return {
            "sentiment": "Unknown",
            "category": "Other",
            "summary": "API query failure"
        }
    
    # Try parsing JSON safely
    result = None
    try:
        # Search for a JSON structure in the text (handles cases where the model includes extra text or backticks)
        match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if match:
            json_str = match.group(0)
            result = json.loads(json_str)
        else:
            result = json.loads(response_text)
    except Exception as e:
        print(f"  [WARNING] JSON Parse Failed: '{response_text}'. Error: {e}")
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

def generate_business_report():
    """
    Compiles the final business report for leadership from the analyzed feedback data.
    """
    if not os.path.exists(OUTPUT_FILE):
        print(f"[ERROR] Cannot generate report: {OUTPUT_FILE} does not exist.")
        return

    # Load analyzed data
    df = pd.read_csv(OUTPUT_FILE, encoding="utf-8")
    total_rows = len(df)
    
    # 1. Top Complaint Categories counts
    category_counts = df['category'].value_counts()
    all_categories = ["Delivery", "App Bug", "Billing", "Staff/Support", "Other"]
    category_counts_dict = {cat: 0 for cat in all_categories}
    for cat, count in category_counts.items():
        if cat in category_counts_dict:
            category_counts_dict[cat] = count
        else:
            category_counts_dict["Other"] += count
            
    # Sort categories in descending order of count
    sorted_categories = sorted(category_counts_dict.items(), key=lambda x: x[1], reverse=True)

    # 2. Sentiment Breakdown (counts and percentages)
    sentiment_counts = df['sentiment'].value_counts()
    all_sentiments = ["Negative", "Neutral", "Positive"]
    sentiment_counts_dict = {sent: 0 for sent in all_sentiments}
    for sent, count in sentiment_counts.items():
        if sent in sentiment_counts_dict:
            sentiment_counts_dict[sent] = count
        else:
            sentiment_counts_dict["Neutral"] += count

    sentiment_data = []
    for sent in all_sentiments:
        count = sentiment_counts_dict[sent]
        percentage = (count / total_rows * 100) if total_rows > 0 else 0.0
        sentiment_data.append((sent, count, f"{percentage:.0f}%"))

    # 3. Fetch Example Complaints (retrieved directly from the df since it contains the text)
    def get_examples(category_name, num_examples=3):
        cat_df = df[df['category'] == category_name]
        # Prioritize negative feedback for examples
        neg_cat_df = cat_df[cat_df['sentiment'] == 'Negative']
        
        examples = []
        if len(neg_cat_df) >= num_examples:
            examples = neg_cat_df['feedback_text'].head(num_examples).tolist()
        else:
            examples = cat_df['feedback_text'].head(num_examples).tolist()
            
        examples = [f'"{ex}"' for ex in examples]
        while len(examples) < num_examples:
            examples.append("(No examples found)")
        return examples

    delivery_examples = get_examples("Delivery")
    billing_examples = get_examples("Billing")

    # Format Markdown Report
    report_md = f"""# Customer Feedback Business Analysis Report

## Top Complaint Categories

| Category | Count |
| --- | --- |
"""
    for cat, count in sorted_categories:
        report_md += f"| {cat} | {count} |\n"

    report_md += f"""
## Sentiment Breakdown

| Sentiment | Count | % |
| --- | --- | --- |
"""
    for sent, count, pct in sentiment_data:
        report_md += f"| {sent} | {count} | {pct} |\n"

    report_md += f"""
## Example Complaints

### Delivery

1. {delivery_examples[0]}
2. {delivery_examples[1]}
3. {delivery_examples[2]}

### Billing

1. {billing_examples[0]}
2. {billing_examples[1]}
3. {billing_examples[2]}
"""

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write(report_md)

    print(f"\n[SUCCESS] Business report successfully saved to {REPORT_FILE}!")
    print("\n" + "=" * 40)
    print("           BUSINESS REPORT PREVIEW      ")
    print("=" * 40)
    print(report_md.strip())
    print("=" * 40 + "\n")

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"[ERROR] Input file {INPUT_FILE} not found.")
        return

    # Read the clean feedback CSV
    df_raw = pd.read_csv(INPUT_FILE, encoding="utf-8")
    total_rows = len(df_raw)
    print(f"[INFO] Loaded {total_rows} total rows from {INPUT_FILE}")

    # Check for existing checkpoint data to support resumption
    if os.path.exists(OUTPUT_FILE):
        try:
            df_out = pd.read_csv(OUTPUT_FILE, encoding="utf-8")
            
            # Legacy checkpoint migration check:
            # If checkpoint lacks 'source', 'rating', or 'feedback_text', join them from clean_feedback
            legacy_cols = ["id", "timestamp", "sentiment", "category", "summary"]
            new_cols = ["source", "rating", "feedback_text"]
            
            # Check basic columns first
            for col in legacy_cols:
                if col not in df_out.columns:
                    raise ValueError(f"Missing basic column {col} in output file")
            
            # Check for any missing new columns
            missing_cols = [col for col in new_cols if col not in df_out.columns]
            if missing_cols:
                print(f"[INFO] Legacy checkpoint format detected. Migrating columns {missing_cols} from raw data...")
                # Merge missing columns from raw clean_feedback.csv
                df_out = pd.merge(df_out, df_raw[['id'] + missing_cols], on='id', how='left')
            
            processed_results = df_out.to_dict('records')
            processed_ids = set(df_out['id'].dropna().astype(int))
            print(f"[INFO] Found checkpoint file: {OUTPUT_FILE} with {len(processed_ids)} processed rows.")
        except Exception as e:
            print(f"[WARNING] Error loading checkpoint ({e}). Starting fresh...")
            processed_results = []
            processed_ids = set()
    else:
        processed_results = []
        processed_ids = set()

    raw_records = df_raw.to_dict('records')
    processed_count_this_run = 0
    
    # We output: id | timestamp | source | rating | feedback_text | sentiment | category | summary
    columns_order = ["id", "timestamp", "source", "rating", "feedback_text", "sentiment", "category", "summary"]

    for idx, row in enumerate(raw_records):
        row_id = int(row['id'])
        if row_id in processed_ids:
            continue

        processed_count_this_run += 1
        current_processed = len(processed_results) + 1
        pct_done = (current_processed / total_rows) * 100
        feedback_text = row['feedback_text']

        # Avoid printing non-ASCII content directly to avoid Console Unicode issues
        clean_msg_preview = feedback_text[:60].encode('ascii', 'ignore').decode('ascii')
        print(f"[Processing] Row {current_processed}/{total_rows} ({pct_done:.1f}%) | ID: {row_id} | Msg: {clean_msg_preview}...")
        
        # Analyze feedback using local LLM
        analysis = analyze_feedback(feedback_text)

        # Build enriched record (including source, rating, and original feedback text as requested)
        enriched_row = {
            "id": row_id,
            "timestamp": row['timestamp'],
            "source": row['source'],
            "rating": row['rating'],
            "feedback_text": feedback_text,
            "sentiment": analysis["sentiment"],
            "category": analysis["category"],
            "summary": analysis["summary"]
        }
        processed_results.append(enriched_row)
        processed_ids.add(row_id)

        # Safety save every 100 records
        if len(processed_results) % SAVE_INTERVAL == 0:
            df_save = pd.DataFrame(processed_results)
            df_save = df_save[columns_order]
            df_save.to_csv(OUTPUT_FILE, index=False, encoding="utf-8")
            print(f"[INFO] [Safety Save] Saved progress ({len(processed_results)} rows) to {OUTPUT_FILE}")

    # Final save if we made changes
    if processed_count_this_run > 0 or not os.path.exists(OUTPUT_FILE):
        df_save = pd.DataFrame(processed_results)
        df_save = df_save[columns_order]
        df_save.to_csv(OUTPUT_FILE, index=False, encoding="utf-8")
        print(f"[SUCCESS] Finished analyzing all data. Saved {len(processed_results)} total rows to {OUTPUT_FILE}")
    else:
        print("[INFO] No new rows to process. All data already fully analyzed.")

    # Compile the business report
    generate_business_report()

    # Automatically synchronize analyzed feedback with the database
    print("\n[INFO] Initiating database synchronization...")
    try:
        from SaveToDb import save_to_db
        save_to_db()
    except Exception as e:
        print(f"[WARNING] Database sync was skipped or failed: {e}")

if __name__ == "__main__":
    main()