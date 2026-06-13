import os
import re
import psycopg2

def main():
    connect_file = "Connectdb.py"
    if not os.path.exists(connect_file):
        print(f"[ERROR] {connect_file} not found in the current directory.")
        return

    # Read Connectdb.py content to extract connection settings
    with open(connect_file, "r", encoding="utf-8") as f:
        content = f.read()

    # Regex parse connection settings from Connectdb.py
    try:
        host = re.search(r'host\s*=\s*["\'](.*?)["\']', content).group(1)
        user = re.search(r'user\s*=\s*["\'](.*?)["\']', content).group(1)
        password = re.search(r'password\s*=\s*["\'](.*?)["\']', content).group(1)
        port = re.search(r'port\s*=\s*["\'](.*?)["\']', content).group(1)
        database = re.search(r'database\s*=\s*["\'](.*?)["\']', content).group(1)
    except Exception as e:
        print(f"[ERROR] Failed to parse connection settings from {connect_file}: {e}")
        print("Please check that the file is formatted correctly.")
        return

    print("[INFO] Parsing database credentials from Connectdb.py...")
    print(f"  - Host: {host}")
    print(f"  - User: {user}")
    print(f"  - Port: {port}")
    print(f"  - Database to check: {database}")

    # 1. Connect to PostgreSQL default database 'postgres' to run administrative commands
    try:
        conn = psycopg2.connect(
            host=host,
            user=user,
            password=password,
            port=port,
            database="postgres"
        )
        conn.autocommit = True
        cursor = conn.cursor()
        print("[INFO] Connected successfully to default database 'postgres'.")
    except Exception as e:
        print(f"[ERROR] Failed to connect to default database 'postgres' as user '{user}': {e}")
        print("Please make sure PostgreSQL service is running and credentials are valid.")
        return

    # 2. Check if the database already exists, and create if missing
    try:
        cursor.execute("SELECT 1 FROM pg_database WHERE datname = %s;", (database,))
        exists = cursor.fetchone()
        if not exists:
            print(f"[INFO] Database '{database}' does not exist. Creating it now...")
            cursor.execute(f'CREATE DATABASE "{database}";')
            print(f"[SUCCESS] Database '{database}' created successfully!")
        else:
            print(f"[INFO] Database '{database}' already exists.")
    except Exception as e:
        print(f"[ERROR] Failed to check or create database '{database}': {e}")
        conn.close()
        return

    conn.close()

    # 3. Connect to target database and verify/create tables and relationships
    try:
        conn = psycopg2.connect(
            host=host,
            user=user,
            password=password,
            port=port,
            database=database
        )
        cursor = conn.cursor()
        print(f"[INFO] Connected to database '{database}' successfully.")
    except Exception as e:
        print(f"[ERROR] Failed to connect to database '{database}': {e}")
        return

    # SQL Queries
    create_batches_table = """
    CREATE TABLE IF NOT EXISTS batches (
        batch_id VARCHAR(50) PRIMARY KEY,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        filename VARCHAR(255),
        total_rows INT,
        status VARCHAR(50) DEFAULT 'processing'
    );
    """

    create_feedback_table = """
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

    add_batch_id_column = """
    ALTER TABLE analyzed_feedback ADD COLUMN IF NOT EXISTS batch_id VARCHAR(50) REFERENCES batches(batch_id);
    """

    try:
        # Create batches table
        cursor.execute(create_batches_table)
        print("[SUCCESS] Table 'batches' verified/created successfully.")

        # Create analyzed_feedback table
        cursor.execute(create_feedback_table)
        print("[SUCCESS] Table 'analyzed_feedback' verified/created successfully.")

        # Add batch_id foreign key constraint
        cursor.execute(add_batch_id_column)
        print("[SUCCESS] Foreign key relationship 'batch_id' verified/added successfully.")

        conn.commit()
    except Exception as e:
        print(f"[ERROR] Failed to construct table schema: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    main()
