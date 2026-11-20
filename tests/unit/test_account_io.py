from __future__ import annotations

from account_io import export_csv, import_payload
from db import add_purchase, list_purchases
from tests.conftest import VALID_PASSWORD
from auth import register_user


def test_import_skips_duplicate_buys(isolated_db):
    user_id = register_user(email="io@example.com", password=VALID_PASSWORD)
    add_purchase(
        user_id=user_id,
        symbol="AAA",
        company_name="Aaa",
        currency="USD",
        shares=2,
        price_per_share=10,
        purchased_at="2024-01-01",
    )
    csv_text = export_csv(user_id)
    result = import_payload(user_id=user_id, raw=csv_text)
    assert result["imported"]["buys"] == 0
    assert result["skipped"]["buys"] == 1
    assert len(list_purchases(user_id=user_id)) == 1
