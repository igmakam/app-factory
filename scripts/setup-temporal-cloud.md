# Temporal Cloud Setup (Free Tier)

## 1. Vytvor účet
https://cloud.temporal.io → Sign up (GitHub login)

## 2. Vytvor Namespace
- Namespace name: `app-factory`
- Region: `aws-us-east-1` (alebo najbližší)

## 3. Získaj credentials
V Temporal Cloud dashboarde:
- Settings → Certificates
- Stiahnuť `client.pem` a `client.key`
- Alebo vygenerovať API key (novšia metóda)

## 4. Connection string
```
TEMPORAL_HOST=app-factory.NAMESPACE_ID.tmprl.cloud:7233
```

## 5. Update .env
```env
TEMPORAL_HOST=app-factory.abc123.tmprl.cloud:7233
TEMPORAL_NAMESPACE=app-factory
TEMPORAL_TLS_CERT=/path/to/client.pem
TEMPORAL_TLS_KEY=/path/to/client.key
```

## 6. Update orchestrator/main.py
Pri TLS pripojení:
```python
from temporalio.client import Client, TLSConfig

client = await Client.connect(
    TEMPORAL_HOST,
    namespace=TEMPORAL_NAMESPACE,
    tls=TLSConfig(
        client_cert=open(TEMPORAL_TLS_CERT, "rb").read(),
        client_private_key=open(TEMPORAL_TLS_KEY, "rb").read(),
    )
)
```

## Free tier limity
- 10M workflow actions/mesiac
- Neobmedzený počet workflows
- Dostatok pre App Factory
