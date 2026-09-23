import os
import pyodbc
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

load_dotenv()

SQL_SERVER = os.getenv("SQL_SERVER", "localhost")
DB_NAME = os.getenv("DB_NAME", "StudentRecordsDB")
ODBC_DRIVER = os.getenv("ODBC_DRIVER", "ODBC Driver 17 for SQL Server")

app = FastAPI(title="Student Records API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5175"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_connection(database: str = "master"):
    conn_str = (
        f"DRIVER={{{ODBC_DRIVER}}};"
        f"SERVER={SQL_SERVER};"
        f"DATABASE={database};"
        f"Trusted_Connection=yes;"
        f"TrustServerCertificate=yes;"
    )
    return pyodbc.connect(conn_str, autocommit=True)


class Student(BaseModel):
    idnum: str = Field(..., min_length=1, max_length=50)
    year_level: str = Field(..., min_length=1, max_length=20)
    name: str = Field(..., min_length=1, max_length=150)
    age: int = Field(..., ge=10, le=100)
    program: str = Field(..., min_length=1, max_length=100)


@app.get("/api/status")
def status():
    """Reports whether the database and table already exist."""
    try:
        conn = get_connection("master")
        cur = conn.cursor()
        cur.execute("SELECT name FROM sys.databases WHERE name = ?", DB_NAME)
        db_exists = cur.fetchone() is not None
        conn.close()

        table_exists = False
        if db_exists:
            conn = get_connection(DB_NAME)
            cur = conn.cursor()
            cur.execute("SELECT name FROM sys.tables WHERE name = 'Students'")
            table_exists = cur.fetchone() is not None
            conn.close()

        return {"database": DB_NAME, "db_exists": db_exists, "table_exists": table_exists}
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/create-database")
def create_database():
    try:
        conn = get_connection("master")
        cur = conn.cursor()
        cur.execute("SELECT name FROM sys.databases WHERE name = ?", DB_NAME)
        exists = cur.fetchone()
        if not exists:
            cur.execute(f"CREATE DATABASE [{DB_NAME}]")
        conn.close()

        conn = get_connection(DB_NAME)
        cur = conn.cursor()
        cur.execute(
            """
            IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Students')
            CREATE TABLE Students (
                id INT IDENTITY(1,1) PRIMARY KEY,
                idnum NVARCHAR(50) NOT NULL UNIQUE,
                year_level NVARCHAR(20) NOT NULL,
                name NVARCHAR(150) NOT NULL,
                age INT NOT NULL,
                program NVARCHAR(100) NOT NULL,
                created_at DATETIME2 DEFAULT SYSDATETIME()
            )
            """
        )
        conn.close()
        return {"status": "ok", "message": f"{DB_NAME} is ready."}
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/students")
def add_student(student: Student):
    try:
        conn = get_connection(DB_NAME)
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO Students (idnum, year_level, name, age, program) VALUES (?, ?, ?, ?, ?)",
            student.idnum,
            student.year_level,
            student.name,
            student.age,
            student.program,
        )
        conn.close()
        return {"status": "ok", "message": "Student added."}
    except pyodbc.IntegrityError:
        raise HTTPException(status_code=409, detail="That ID number is already recorded.")
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/students")
def list_students():
    try:
        conn = get_connection(DB_NAME)
        cur = conn.cursor()
        cur.execute(
            "SELECT idnum, year_level, name, age, program FROM Students ORDER BY created_at DESC"
        )
        rows = cur.fetchall()
        conn.close()
        return [
            {"idnum": r[0], "year_level": r[1], "name": r[2], "age": r[3], "program": r[4]}
            for r in rows
        ]
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
