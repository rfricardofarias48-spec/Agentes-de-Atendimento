FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git curl && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 https://github.com/mem0ai/mem0.git /tmp/mem0 && \
    cp -r /tmp/mem0/server/. /app/ && \
    rm -rf /tmp/mem0

RUN pip install --no-cache-dir \
    fastapi==0.115.8 \
    uvicorn==0.34.0 \
    "pydantic[email]==2.10.4" \
    "mem0ai[graph]>=0.1.48" \
    python-dotenv==1.0.1 \
    "psycopg[binary,pool]>=3.2.8" \
    "psycopg-pool>=3.2.6,<4.0.0" \
    "sqlalchemy>=2.0,<3.0" \
    "alembic>=1.13,<2.0" \
    anthropic \
    "passlib[bcrypt]" \
    bcrypt==4.0.1 \
    "python-jose[cryptography]" \
    slowapi \
    rank-bm25 \
    langchain-neo4j \
    neo4j \
    posthog

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
