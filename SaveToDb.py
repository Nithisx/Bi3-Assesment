import os
import math
import pandas as pd

# Constants
OUTPUT_FILE = "analyzed_feedback.csv"

def save_to_db():
    """
    Connects to the database using Connectdb.py, verifies the schema, and saves
    new feedback records to the analyzed_feedback table, skipping duplicates.
    """
    if not os.path.exists(OUTPUT_FILE):
        print(f"[ERROR] Output file {OUTPUT_FILE} not found. Please analyze feedback first.")
        return

    # Attempt to load connection and cursor from Connectdb.py
    try:
        from Connectdb import conn, cursor
    except ImportError:
        print("[ERROR] Could not import conn/cursor from Connectdb.py. Verify database credentials in Connectdb.py.")
        return
    except Exception as e:
        print(f"[ERROR] Failed to load database connection from Connectdb.py: {e}")
        return

    # 1. Create table if it does not exist
    create_table_query = """
    CREATE TABLE IF NOT EXISTS analyzed_feedback (
        id INT PRIMARY KEY,
        timestamp VARCHAR(50),
        source VARCHAR(100),
        rating FLOAT,
        feedback_text TEXT,
        sentiment VARCHAR(50),
        category VARCHAR(100),
        summary TEXT
    );
    """
    try:
        cursor.execute(create_table_query)
        conn.commit()
        print("[INFO] Database table 'analyzed_feedback' verified/created successfully.")
    except Exception as e:
        print(f"[ERROR] Failed to verify or create database table 'analyzed_feedback': {e}")
        return

    # 2. Load the analyzed feedback records
    try:
        df = pd.read_csv(OUTPUT_FILE, encoding="utf-8")
    except Exception as e:
        print(f"[ERROR] Failed to read {OUTPUT_FILE}: {e}")
        return

    total_records = len(df)
    inserted_count = 0
    skipped_count = 0

    print(f"[INFO] Syncing {total_records} records with the database...")

    # 3. Insert records one-by-one, skipping duplicates using ON CONFLICT DO NOTHING
    for idx, row in df.iterrows():
        # Clean ratings (float or NULL)
        rating_val = row['rating']
        if pd.isna(rating_val) or math.isnan(rating_val):
            rating_val = None
        else:
            rating_val = float(rating_val)

        insert_query = """
        INSERT INTO analyzed_feedback (id, timestamp, source, rating, feedback_text, sentiment, category, summary)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (id) DO NOTHING;
        """
        try:
            cursor.execute(insert_query, (
                int(row['id']),
                str(row['timestamp']),
                str(row['source']),
                rating_val,
                str(row['feedback_text']),
                str(row['sentiment']),
                str(row['category']),
                str(row['summary'])
            ))
            # psycopg2's rowcount is 1 if inserted, 0 if conflict skipped it
            if cursor.rowcount > 0:
                inserted_count += 1
            else:
                skipped_count += 1
        except Exception as e:
            print(f"[WARNING] Failed to insert record ID {row['id']}: {e}")
            conn.rollback()  # Rollback transaction for this failure to keep it clean
            continue

    # Commit all successful inserts
    try:
        conn.commit()
        print(f"[SUCCESS] Database sync completed!")
        print(f"  - Total records processed: {total_records}")
        print(f"  - Newly inserted: {inserted_count}")
        print(f"  - Skipped (already existed): {skipped_count}")
    except Exception as e:
        print(f"[ERROR] Failed to commit changes to PostgreSQL: {e}")

if __name__ == "__main__":
    save_to_db()
