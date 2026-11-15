"""Tiny additive migration: adds columns that exist in the models but not yet
in the database (create_all only creates missing tables). Only nullable
columns or columns with a simple default are added; nothing is dropped."""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.schema import MetaData

logger = logging.getLogger("gratia.migrate")


def _default_sql(column) -> str:
    default = getattr(column.default, "arg", None)
    if default is None or callable(default):
        return ""
    if isinstance(default, bool):
        return " DEFAULT " + ("TRUE" if default else "FALSE")
    if isinstance(default, (int, float)):
        return f" DEFAULT {default}"
    if isinstance(default, str):
        return " DEFAULT '" + default.replace("'", "''") + "'"
    return ""


def add_missing_columns(engine: Engine, metadata: MetaData) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as connection:
        for table in metadata.sorted_tables:
            if table.name not in existing_tables:
                continue
            present = {column["name"] for column in inspector.get_columns(table.name)}
            for column in table.columns:
                if column.name in present:
                    continue
                default = _default_sql(column)
                if not column.nullable and not default:
                    logger.warning("Cannot add NOT NULL column %s.%s without a default", table.name, column.name)
                    continue
                column_type = column.type.compile(dialect=engine.dialect)
                null = "" if column.nullable else " NOT NULL"
                connection.execute(
                    text(f'ALTER TABLE "{table.name}" ADD COLUMN "{column.name}" {column_type}{default}{null}')
                )
                logger.warning("Added column %s.%s", table.name, column.name)
