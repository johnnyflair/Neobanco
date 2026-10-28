"""Crear o cambiar la contraseña de una persona del equipo para el panel (/admin).

    python -m app.staff_cli correo@coop.cr "Nombre Apellido" admin|operaciones|lectura

Pide la contraseña sin mostrarla (mínimo 12 caracteres). Si el correo ya existe, actualiza
nombre, rol y contraseña, y la reactiva.
"""

import asyncio
import getpass
import sys

from sqlalchemy import func, select

from app.core.security import hash_secret
from app.db.models import StaffRole, StaffUser
from app.db.session import sessionmaker


async def upsert(email: str, name: str, role: StaffRole, password: str) -> str:
    async with sessionmaker()() as s:
        u = await s.scalar(select(StaffUser).where(func.lower(StaffUser.email) == email.lower()))
        if u is None:
            s.add(StaffUser(email=email.lower(), full_name=name, role=role, password_hash=hash_secret(password),
                            active=True, failed_attempts=0))
            msg = "creada"
        else:
            u.full_name, u.role, u.password_hash, u.active, u.failed_attempts, u.locked_until = (
                name, role, hash_secret(password), True, 0, None)
            msg = "actualizada"
        await s.commit()
    return msg


def main() -> None:
    if len(sys.argv) != 4 or sys.argv[3] not in StaffRole.__members__:
        raise SystemExit(__doc__)
    pwd = getpass.getpass("Contraseña (mínimo 12): ")
    if len(pwd) < 12 or pwd != getpass.getpass("Repetila: "):
        raise SystemExit("La contraseña no coincide o es muy corta.")
    print("Persona", asyncio.run(upsert(sys.argv[1], sys.argv[2], StaffRole(sys.argv[3]), pwd)))


if __name__ == "__main__":
    main()
