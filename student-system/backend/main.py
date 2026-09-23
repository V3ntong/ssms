import os
import re
import pyodbc
from datetime import date, datetime
from decimal import Decimal
from typing import Any
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


# ---------------------------------------------------------------------------
# General-purpose database manager
# ---------------------------------------------------------------------------

IDENTIFIER_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,127}$")

SYSTEM_DATABASES = {"master", "model", "msdb", "tempdb"}

RESERVED_WORDS = {
    "ADD", "ALL", "ALTER", "AND", "ANY", "AS", "ASC", "AUTHORIZATION",
    "BACKUP", "BEGIN", "BETWEEN", "BREAK", "BROWSE", "BULK", "BY",
    "CASCADE", "CASE", "CHECK", "CHECKPOINT", "CLOSE", "CLUSTERED",
    "COALESCE", "COLLATE", "COLUMN", "COMMIT", "COMPUTE", "CONSTRAINT",
    "CONTAINS", "CONTAINSTABLE", "CONTINUE", "CONVERT", "CREATE", "CROSS",
    "CURRENT", "CURRENT_DATE", "CURRENT_TIME", "CURRENT_TIMESTAMP",
    "CURRENT_USER", "CURSOR",
    "DATABASE", "DBCC", "DEALLOCATE", "DECLARE", "DEFAULT", "DELETE",
    "DENY", "DESC", "DISK", "DISTINCT", "DISTRIBUTED", "DOUBLE", "DROP",
    "DUMP",
    "ELSE", "END", "ERRLVL", "ESCAPE", "EXCEPT", "EXEC", "EXECUTE",
    "EXISTS", "EXIT", "EXTERNAL",
    "FETCH", "FILE", "FILLFACTOR", "FOR", "FOREIGN", "FREETEXT",
    "FREETEXTTABLE", "FROM", "FULL", "FUNCTION",
    "GOTO", "GRANT", "GROUP",
    "HAVING", "HOLDLOCK",
    "IDENTITY", "IDENTITY_INSERT", "IDENTITYCOL", "IF", "IN", "INDEX",
    "INNER", "INSERT", "INTERSECT", "INTO", "IS",
    "JOIN",
    "KEY", "KILL",
    "LEFT", "LIKE", "LINENO", "LOAD",
    "MERGE",
    "NATIONAL", "NOCHECK", "NONCLUSTERED", "NOT", "NULL", "NULLIF",
    "OF", "OFF", "OFFSETS", "ON", "OPEN", "OPENDATASOURCE", "OPENQUERY",
    "OPENROWSET", "OPENXML", "OPTION", "OR", "ORDER", "OUTER", "OVER",
    "PERCENT", "PIVOT", "PLAN", "PRECISION", "PRIMARY", "PRINT", "PROC",
    "PROCEDURE", "PUBLIC",
    "RAISERROR", "READ", "READTEXT", "RECONFIGURE", "REFERENCES",
    "REPLICATION", "RESTORE", "RESTRICT", "RETURN", "REVERT", "REVOKE",
    "RIGHT", "ROLLBACK", "ROWCOUNT", "ROWGUIDCOL", "RULE",
    "SAVE", "SCHEMA", "SECURITYAUDIT", "SELECT", "SESSION_USER", "SET",
    "SETUSER", "SHUTDOWN", "SOME", "STATISTICS", "SYSTEM_USER",
    "TABLE", "TABLESAMPLE", "TEXTSIZE", "THEN", "TO", "TOP", "TRAN",
    "TRANSACTION", "TRIGGER", "TRUNCATE", "TRY_CONVERT", "TSEQUAL",
    "UNION", "UNIQUE", "UNPIVOT", "UPDATE", "UPDATETEXT", "USE", "USER",
    "VALUES", "VARYING", "VIEW",
    "WAITFOR", "WHEN", "WHERE", "WHILE", "WITH", "WRITETEXT",
    # SQL types commonly rejected as identifiers too
    "INT", "INTEGER", "BIGINT", "SMALLINT", "TINYINT", "DATE", "DATETIME",
    "BIT", "NVARCHAR", "VARCHAR", "NCHAR", "CHAR", "TEXT", "TIME",
    "DECIMAL", "NUMERIC", "FLOAT", "REAL", "BOOLEAN", "BOOL",
}


def validate_identifier(name: str, kind: str) -> str:
    """Allow-list check for SQL identifiers (cannot be parameterized).

    Rejects anything that is not letters/numbers/underscores starting with a
    letter, and rejects SQL Server reserved words. Never sanitizes — rejects.
    """
    if not isinstance(name, str) or not IDENTIFIER_RE.match(name):
        raise HTTPException(
            status_code=400,
            detail=(
                f"Invalid {kind}: only letters, numbers, and underscores are "
                "allowed, and it must start with a letter."
            ),
        )
    if name.upper() in RESERVED_WORDS:
        raise HTTPException(
            status_code=400,
            detail=f"'{name}' is a reserved SQL Server word and cannot be used as a {kind}.",
        )
    return name


FIELD_TYPE_MAP = {
    "text": "NVARCHAR(255)",
    "nvarchar": "NVARCHAR(255)",
    "number": "INT",
    "int": "INT",
    "integer": "INT",
    "date": "DATE",
    "yesno": "BIT",
    "yes/no": "BIT",
    "bit": "BIT",
    "boolean": "BIT",
    "bool": "BIT",
}


class DatabaseCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)


class FieldDef(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    type: str = Field(..., min_length=1, max_length=32)


class TableCreate(BaseModel):
    table_name: str = Field(..., min_length=1, max_length=128)
    fields: list[FieldDef] = Field(..., min_length=1, max_length=64)


def database_exists(db_name: str) -> bool:
    conn = get_connection("master")
    try:
        cur = conn.cursor()
        cur.execute("SELECT name FROM sys.databases WHERE name = ?", db_name)
        return cur.fetchone() is not None
    finally:
        conn.close()


def require_database(db_name: str) -> str:
    validate_identifier(db_name, "database name")
    if db_name.lower() in SYSTEM_DATABASES:
        raise HTTPException(
            status_code=400,
            detail=f"'{db_name}' is a system database and cannot be managed here.",
        )
    if not database_exists(db_name):
        raise HTTPException(status_code=404, detail=f"Database '{db_name}' does not exist.")
    return db_name


def require_table(cur, table_name: str) -> str:
    validate_identifier(table_name, "table name")
    cur.execute("SELECT name FROM sys.tables WHERE name = ?", table_name)
    if cur.fetchone() is None:
        raise HTTPException(status_code=404, detail=f"Table '{table_name}' does not exist.")
    return table_name


def get_table_columns(cur, table_name: str) -> list[dict]:
    cur.execute(
        "SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS "
        "WHERE TABLE_NAME = ? ORDER BY ORDINAL_POSITION",
        table_name,
    )
    return [{"name": r[0], "type": r[1].upper()} for r in cur.fetchall()]


def coerce_value(value: Any, data_type: str) -> Any:
    dt = data_type.lower()
    if value is None:
        return None
    if dt.startswith("nvarchar") or dt.startswith("varchar") or dt in ("text", "char"):
        return str(value)
    if isinstance(value, str) and not value.strip():
        return None
    if dt == "bit":
        if isinstance(value, bool):
            return 1 if value else 0
        s = str(value).strip().lower()
        if s in ("1", "true", "yes", "y"):
            return 1
        if s in ("0", "false", "no", "n"):
            return 0
        raise HTTPException(status_code=400, detail=f"Invalid yes/no value '{value}'.")
    if dt in ("int", "integer", "smallint", "tinyint", "bigint"):
        if isinstance(value, bool):
            return 1 if value else 0
        try:
            return int(str(value).strip())
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid number '{value}'.")
    if dt == "date":
        s = str(value).strip()
        try:
            return date.fromisoformat(s[:10])
        except ValueError:
            raise HTTPException(
                status_code=400, detail=f"Invalid date '{value}'. Use YYYY-MM-DD."
            )
    return str(value)


def serialize_value(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, memoryview):
        return bytes(value).hex()
    if isinstance(value, bytes):
        return value.hex()
    return value


@app.post("/api/databases")
def create_named_database(body: DatabaseCreate):
    name = validate_identifier(body.name, "database name")
    if name.lower() in SYSTEM_DATABASES:
        raise HTTPException(
            status_code=400,
            detail=f"'{name}' is a system database name and cannot be used.",
        )
    if database_exists(name):
        raise HTTPException(status_code=409, detail=f"Database '{name}' already exists.")
    try:
        conn = get_connection("master")
        try:
            conn.cursor().execute(f"CREATE DATABASE [{name}]")
        finally:
            conn.close()
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok", "name": name, "message": f"Database '{name}' created."}


@app.get("/api/databases")
def list_named_databases():
    try:
        conn = get_connection("master")
        try:
            cur = conn.cursor()
            cur.execute("SELECT name FROM sys.databases ORDER BY name")
            names = [r[0] for r in cur.fetchall()]
        finally:
            conn.close()
        return [n for n in names if n.lower() not in SYSTEM_DATABASES]
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/databases/{db_name}")
def drop_named_database(db_name: str):
    validate_identifier(db_name, "database name")
    if db_name.lower() in SYSTEM_DATABASES:
        raise HTTPException(
            status_code=400,
            detail=f"'{db_name}' is a system database and cannot be dropped.",
        )
    if not database_exists(db_name):
        raise HTTPException(status_code=404, detail=f"Database '{db_name}' does not exist.")
    try:
        conn = get_connection("master")
        try:
            cur = conn.cursor()
            cur.execute(f"ALTER DATABASE [{db_name}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE")
            cur.execute(f"DROP DATABASE [{db_name}]")
        finally:
            conn.close()
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok", "message": f"Database '{db_name}' dropped."}


@app.post("/api/databases/{db_name}/tables")
def create_named_table(db_name: str, body: TableCreate):
    require_database(db_name)
    table_name = validate_identifier(body.table_name, "table name")

    seen = set()
    column_defs = []
    for f in body.fields:
        fname = validate_identifier(f.name, "field name")
        if fname.lower() == "id":
            raise HTTPException(
                status_code=400,
                detail="The field name 'id' is reserved for the primary key.",
            )
        if fname.lower() in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate field name '{fname}'.")
        seen.add(fname.lower())
        sql_type = FIELD_TYPE_MAP.get(f.type.strip().lower())
        if sql_type is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown field type '{f.type}'. Allowed: text, number, date, yes/no.",
            )
        column_defs.append(f"[{fname}] {sql_type}")

    try:
        conn = get_connection(db_name)
        try:
            cur = conn.cursor()
            cur.execute("SELECT name FROM sys.tables WHERE name = ?", table_name)
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=409, detail=f"Table '{table_name}' already exists."
                )
            col_sql = ",\n    ".join(column_defs)
            cur.execute(
                f"CREATE TABLE [{table_name}] (\n"
                f"    id INT IDENTITY(1,1) PRIMARY KEY,\n"
                f"    {col_sql}\n"
                ")"
            )
        finally:
            conn.close()
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {
        "status": "ok",
        "message": f"Table '{table_name}' created in '{db_name}'.",
    }


@app.get("/api/databases/{db_name}/tables")
def list_named_tables(db_name: str):
    require_database(db_name)
    try:
        conn = get_connection(db_name)
        try:
            cur = conn.cursor()
            cur.execute("SELECT name FROM sys.tables ORDER BY name")
            return [r[0] for r in cur.fetchall()]
        finally:
            conn.close()
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/databases/{db_name}/tables/{table_name}")
def drop_named_table(db_name: str, table_name: str):
    require_database(db_name)
    validate_identifier(table_name, "table name")
    try:
        conn = get_connection(db_name)
        try:
            cur = conn.cursor()
            require_table(cur, table_name)
            cur.execute(f"DROP TABLE [{table_name}]")
        finally:
            conn.close()
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok", "message": f"Table '{table_name}' dropped."}


@app.get("/api/databases/{db_name}/tables/{table_name}/rows")
def list_table_rows(db_name: str, table_name: str):
    require_database(db_name)
    validate_identifier(table_name, "table name")
    try:
        conn = get_connection(db_name)
        try:
            cur = conn.cursor()
            require_table(cur, table_name)
            columns = get_table_columns(cur, table_name)
            select_list = ", ".join(f"[{c['name']}]" for c in columns)
            cur.execute(f"SELECT {select_list} FROM [{table_name}] ORDER BY [id]")
            names = [c["name"] for c in columns]
            rows = [
                {n: serialize_value(v) for n, v in zip(names, r)}
                for r in cur.fetchall()
            ]
            return {"columns": columns, "rows": rows}
        finally:
            conn.close()
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))


def _prepare_row_values(cur, table_name: str, payload: dict[str, Any], forbid_id: bool):
    columns = get_table_columns(cur, table_name)
    col_map = {c["name"].lower(): c for c in columns}
    names = []
    values = []
    for key, val in payload.items():
        validate_identifier(key, "column name")
        info = col_map.get(key.lower())
        if info is None:
            raise HTTPException(status_code=400, detail=f"Unknown column '{key}'.")
        if info["name"].lower() == "id":
            if forbid_id:
                raise HTTPException(
                    status_code=400, detail="The 'id' column cannot be modified."
                )
            continue
        names.append(info["name"])
        values.append(coerce_value(val, info["type"]))
    if not names:
        raise HTTPException(status_code=400, detail="No values provided.")
    return names, values


@app.post("/api/databases/{db_name}/tables/{table_name}/rows")
def insert_table_row(db_name: str, table_name: str, payload: dict[str, Any]):
    require_database(db_name)
    validate_identifier(table_name, "table name")
    if not payload:
        raise HTTPException(status_code=400, detail="No values provided.")
    try:
        conn = get_connection(db_name)
        try:
            cur = conn.cursor()
            require_table(cur, table_name)
            names, values = _prepare_row_values(cur, table_name, payload, forbid_id=True)
            col_sql = ", ".join(f"[{n}]" for n in names)
            placeholders = ", ".join("?" for _ in names)
            cur.execute(
                f"INSERT INTO [{table_name}] ({col_sql}) VALUES ({placeholders})",
                *values,
            )
        finally:
            conn.close()
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok", "message": "Row added."}


@app.put("/api/databases/{db_name}/tables/{table_name}/rows/{row_id}")
def update_table_row(db_name: str, table_name: str, row_id: int, payload: dict[str, Any]):
    require_database(db_name)
    validate_identifier(table_name, "table name")
    if not payload:
        raise HTTPException(status_code=400, detail="No values provided.")
    try:
        conn = get_connection(db_name)
        try:
            cur = conn.cursor()
            require_table(cur, table_name)
            names, values = _prepare_row_values(cur, table_name, payload, forbid_id=True)
            set_sql = ", ".join(f"[{n}] = ?" for n in names)
            params = list(values) + [row_id]
            cur.execute(
                f"UPDATE [{table_name}] SET {set_sql} WHERE id = ?",
                *params,
            )
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=404, detail=f"Row {row_id} was not found."
                )
        finally:
            conn.close()
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok", "message": f"Row {row_id} updated."}


@app.delete("/api/databases/{db_name}/tables/{table_name}/rows/{row_id}")
def delete_table_row(db_name: str, table_name: str, row_id: int):
    require_database(db_name)
    validate_identifier(table_name, "table name")
    try:
        conn = get_connection(db_name)
        try:
            cur = conn.cursor()
            require_table(cur, table_name)
            cur.execute(f"DELETE FROM [{table_name}] WHERE id = ?", row_id)
            if cur.rowcount == 0:
                raise HTTPException(
                    status_code=404, detail=f"Row {row_id} was not found."
                )
        finally:
            conn.close()
    except pyodbc.Error as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"status": "ok", "message": f"Row {row_id} deleted."}
