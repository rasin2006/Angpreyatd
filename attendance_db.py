"""PostgreSQL mirror for the attendance application's shared school data.

The JSON and CSV files remain the source used by the legacy Flask screens while
this module is introduced.  Writes are deliberately best-effort so a temporary
database outage cannot stop a student from checking in at the kiosk.
"""

import os
from contextlib import closing
from datetime import datetime


def _database_url():
    return os.environ.get("DATABASE_URL", "").strip()


def enabled():
    return bool(_database_url())


def _connect():
    import psycopg2
    return psycopg2.connect(_database_url(), connect_timeout=3)


def sync_student(student):
    """Upsert a student and all of their NFC card UIDs into PostgreSQL."""
    if not enabled() or not student or not student.get("student_id"):
        return

    student_id = str(student["student_id"])
    schedules = student.get("schedules") or ([student["schedule"]] if student.get("schedule") else [])
    with closing(_connect()) as conn, closing(conn.cursor()) as cur:
        cur.execute(
            """
            INSERT INTO school_students
              (student_id, full_name, sex, photo_filename, registered_at, schedules, updated_at)
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, NOW())
            ON CONFLICT (student_id) DO UPDATE SET
              full_name = EXCLUDED.full_name,
              sex = EXCLUDED.sex,
              photo_filename = EXCLUDED.photo_filename,
              registered_at = COALESCE(EXCLUDED.registered_at, school_students.registered_at),
              schedules = EXCLUDED.schedules,
              updated_at = NOW()
            """,
            (
                student_id,
                student.get("name", ""),
                student.get("sex"),
                student.get("photo"),
                student.get("registered_at"),
                __import__("json").dumps(schedules),
            ),
        )
        for card_uid in student.get("card_uids", []):
            if card_uid:
                cur.execute(
                    """
                    INSERT INTO nfc_cards (card_uid, student_id, active, updated_at)
                    VALUES (%s, %s, TRUE, NOW())
                    ON CONFLICT (card_uid) DO UPDATE SET
                      student_id = EXCLUDED.student_id,
                      active = TRUE,
                      updated_at = NOW()
                    """,
                    (str(card_uid).upper(), student_id),
                )
        conn.commit()


def record_attendance_event(*, student, card_uid, schedule, slot, status, attendance_status, scanned_at=None):
    """Append an immutable scan event after the legacy CSV update succeeds."""
    if not enabled() or not student or not student.get("student_id"):
        return

    scanned_at = scanned_at or datetime.now()
    with closing(_connect()) as conn, closing(conn.cursor()) as cur:
        cur.execute(
            """
            INSERT INTO attendance_events
              (student_id, card_uid, scanned_at, attendance_date, schedule, slot, record_status, attendance_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                str(student["student_id"]),
                str(card_uid).upper() if card_uid else None,
                scanned_at,
                scanned_at.date(),
                schedule,
                slot,
                status,
                attendance_status,
            ),
        )
        conn.commit()
