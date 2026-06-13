import psycopg2

try:
    conn = psycopg2.connect(
        host="localhost",
        database="bi3",
        user="sih",
        password="123456",
        port="5432"
    )

    cursor = conn.cursor()
    print("[SUCCESS] Connected to PostgreSQL")

except Exception as e:
    print("[ERROR] Connection failed:", e)