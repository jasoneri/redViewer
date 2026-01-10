FROM python:3.12-slim
WORKDIR /app
RUN pip install uv
COPY pyproject.toml .
RUN uv sync
COPY backend/ ./backend/
WORKDIR /app/backend
EXPOSE 8080
CMD ["sh", "-c", "uv run uvicorn app:app --host 0.0.0.0 --port ${PORT:-8080}"]