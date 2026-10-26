"""Resolve legacy identities only after unique, verified correspondence."""
def linked_person(c,user,review=False):
    from .app import fail
    explicit=c.execute('SELECT * FROM members_people WHERE account_user_id=? AND active=1',(user['id'],)).fetchall()
    if len(explicit)==1:return explicit[0]
    if len(explicit)>1:
        if review:fail('identity','A gestão precisa revisar os cadastros ligados à sua conta.',409)
        return None
    legacy=c.execute('SELECT * FROM members_people WHERE lower(email)=lower(?) AND active=1',(user['email'],)).fetchall()
    verified=c.execute('SELECT email_verified FROM users WHERE id=?',(user['id'],)).fetchone()
    if len(legacy)==1 and legacy[0]['account_user_id'] is None and verified and verified[0]:return legacy[0]
    if legacy and review:fail('identity','A gestão precisa confirmar o vínculo do cadastro com sua conta antes de salvar.',409)
    return None


def account_for_person(c,person):
    if person['account_user_id'] is not None:
        return c.execute('SELECT id FROM users WHERE id=? AND active=1',(person['account_user_id'],)).fetchone()
    if not person['email']:return None
    users=c.execute('SELECT * FROM users WHERE lower(email)=lower(?) AND active=1 AND email_verified=1',(person['email'],)).fetchall()
    if len(users)!=1:return None
    resolved=linked_person(c,dict(users[0]))
    return users[0] if resolved and resolved['id']==person['id'] else None
