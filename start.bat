@echo off
echo Starting local server for Echo Language Player...
start http://localhost:8000
python -m http.server 8000
pause
