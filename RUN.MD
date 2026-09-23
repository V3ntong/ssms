cd "/c/APP FLUTTER/ssms/student-system"
pwd


cat > start.sh <<'EOF'
#!/bin/bash
cd "$(dirname "$0")"

(cd backend && python -m uvicorn main:app --reload --port 8000) &
BACKEND_PID=$!

(cd frontend && npm run dev)

kill $BACKEND_PID 2>/dev/null
EOF
bash start.sh