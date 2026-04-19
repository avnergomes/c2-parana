#!/usr/bin/env python3
"""Provisiona usuario de teste com acesso enterprise full.

Cria (idempotente) o usuario teste@teste.com / teste123456 via Supabase Admin API
e garante que a tabela `subscriptions` tenha um registro com status='active' e
plan='enterprise' para liberar todas as features no frontend.
"""

import os
import sys
from datetime import datetime, timezone, timedelta

from dotenv import load_dotenv
from supabase import create_client, Client

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

TEST_EMAIL = "teste@teste.com"
TEST_PASSWORD = "teste123456"
TEST_FULL_NAME = "Usuario de Teste"


def upsert_user(supabase: Client) -> str:
    """Cria ou atualiza o usuario de teste. Retorna o user_id."""
    existing = supabase.auth.admin.list_users()
    users = existing if isinstance(existing, list) else getattr(existing, "users", [])
    for u in users:
        email = getattr(u, "email", None) or (u.get("email") if isinstance(u, dict) else None)
        if email and email.lower() == TEST_EMAIL:
            uid = getattr(u, "id", None) or u.get("id")
            print(f"[seed] Usuario ja existe: {TEST_EMAIL} (id={uid}). Resetando senha...")
            supabase.auth.admin.update_user_by_id(
                uid,
                {
                    "password": TEST_PASSWORD,
                    "email_confirm": True,
                    "user_metadata": {"full_name": TEST_FULL_NAME},
                },
            )
            return uid

    print(f"[seed] Criando usuario {TEST_EMAIL}...")
    res = supabase.auth.admin.create_user(
        {
            "email": TEST_EMAIL,
            "password": TEST_PASSWORD,
            "email_confirm": True,
            "user_metadata": {"full_name": TEST_FULL_NAME},
        }
    )
    user = getattr(res, "user", None) or res.get("user")
    uid = getattr(user, "id", None) or user.get("id")
    print(f"[seed] Usuario criado (id={uid}).")
    return uid


def upsert_subscription(supabase: Client, user_id: str) -> None:
    """Garante subscription enterprise/active para o user_id."""
    far_future = (datetime.now(timezone.utc) + timedelta(days=3650)).isoformat()
    payload = {
        "user_id": user_id,
        "status": "active",
        "plan": "enterprise",
        "trial_end": None,
        "current_period_start": datetime.now(timezone.utc).isoformat(),
        "current_period_end": far_future,
        "cancel_at_period_end": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    print(f"[seed] Upsert subscription enterprise/active para user_id={user_id}...")
    supabase.table("subscriptions").upsert(payload, on_conflict="user_id").execute()
    print("[seed] Subscription pronta.")


def main() -> int:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    uid = upsert_user(supabase)
    upsert_subscription(supabase, uid)
    print(f"\n[seed] OK. Login: {TEST_EMAIL} / {TEST_PASSWORD} (plan=enterprise, status=active)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
