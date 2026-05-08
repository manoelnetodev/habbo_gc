-- ===========================================================================
-- gather-pivot customisations
-- Runs on first MariaDB boot (docker-entrypoint-initdb.d) after the upstream
-- arcturus dumps. Filename starts with "zz-" so it sorts last alphabetically.
-- Everything below is idempotent: safe to re-run on a re-seeded DB.
-- ===========================================================================

USE arcturus;

-- --------------------------------------------------------------------------
-- 1. Currency: every user born with effectively unlimited money. UI hides
--    the purse anyway; this just stops the emulator from refusing actions
--    that internally cost credits/duckets/diamonds.
-- --------------------------------------------------------------------------

ALTER TABLE users
    MODIFY credits INT(11) NOT NULL DEFAULT 999999999,
    MODIFY points  INT(11) NOT NULL DEFAULT 999999999;

UPDATE users SET credits = 999999999, points = 999999999;

INSERT INTO users_currency (user_id, type, amount)
    SELECT id, 0, 999999999 FROM users
    ON DUPLICATE KEY UPDATE amount = 999999999;

INSERT INTO users_currency (user_id, type, amount)
    SELECT id, 5, 999999999 FROM users
    ON DUPLICATE KEY UPDATE amount = 999999999;

-- --------------------------------------------------------------------------
-- 2. Habbo Club: every user is permanently HC. INT(11) caps at 2038-01-19;
--    that's the practical "forever" for this kind of timestamp column.
-- --------------------------------------------------------------------------

ALTER TABLE users_settings
    MODIFY club_expire_timestamp INT(11) NOT NULL DEFAULT 2147483647;

UPDATE users_settings SET club_expire_timestamp = 2147483647;

-- --------------------------------------------------------------------------
-- 3. Catalog: everything free. The catalog UI is hidden today, but if it ever
--    gets re-enabled or used internally, every item costs zero.
-- --------------------------------------------------------------------------

UPDATE catalog_items SET cost_credits = 0, cost_points = 0;

-- --------------------------------------------------------------------------
-- 4. Navigator categories renamed to PT-BR. Names live in DB rows, not in
--    text packs, so the UITextsBR.json overrides do not reach them.
-- --------------------------------------------------------------------------

UPDATE navigator_publiccats SET name = 'Destaques'         WHERE id = 1;
UPDATE navigator_publiccats SET name = 'Salas Oficiais'    WHERE id = 2;
UPDATE navigator_publiccats SET name = 'Fansites Oficiais' WHERE id = 3;

-- --------------------------------------------------------------------------
-- 5. Promote Systemaccount to admin and pin Sala de Estudos in Staff Picks.
--    Room 50 (Dark Elegant Bundle) is shipped pre-furnished by the upstream
--    catalogue dump.
-- --------------------------------------------------------------------------

UPDATE users
    SET rank = 7,
        auth_ticket = '1',
        username = 'Admin',
        motto = 'Administrador'
    WHERE id = 1;

-- --------------------------------------------------------------------------
-- 5b. 500 student accounts seeded with deterministic SSO tickets ('1'..'500').
--     The admin above already owns ticket '1'. Ranks default to 1 (Member),
--     which has no kick/ban/mute/anyroomowner — so they can only enter rooms,
--     chat, walk around. Names are placeholders; the NameGate popup will rewrite
--     them via /signaling/set-name on first login.
--     `seq_2_to_500` is a MariaDB built-in virtual numbers table.
-- --------------------------------------------------------------------------

-- Wipe any earlier Aluno*/Convidado-style row that conflicts with our scheme
DELETE FROM users
    WHERE id <> 1
      AND (username LIKE 'Aluno%' OR username = 'Convidado'
           OR auth_ticket REGEXP '^[0-9]+$');

INSERT INTO users
    (username, real_name, password, mail, account_created, last_login, last_online,
     motto, look, gender, rank, credits, points, online,
     ip_register, ip_current, home_room, auth_ticket)
SELECT
    CONCAT('Aluno', LPAD(seq, 3, '0')),
    'Aluno',
    'arcturus_pw',
    CONCAT('aluno', seq, '@local'),
    UNIX_TIMESTAMP(), 0, 0,
    '',
    'hd-180-1.ch-255-66.lg-280-110.sh-305-62',
    'M',
    1,
    999999999, 999999999,
    '0',
    '127.0.0.1', '127.0.0.1',
    0,
    CAST(seq AS CHAR)
FROM seq_2_to_500;

-- Admin tickets: SSO '1' and '2'. Everyone else stays Member (rank=1).
UPDATE users SET rank = 7 WHERE auth_ticket IN ('1', '2');

-- mirror users_settings + users_currency for the new cohort
INSERT IGNORE INTO users_settings (user_id) SELECT id FROM users WHERE id NOT IN (SELECT user_id FROM users_settings);

INSERT INTO users_currency (user_id, type, amount)
    SELECT id, 0, 999999999 FROM users
    ON DUPLICATE KEY UPDATE amount = 999999999;
INSERT INTO users_currency (user_id, type, amount)
    SELECT id, 5, 999999999 FROM users
    ON DUPLICATE KEY UPDATE amount = 999999999;

UPDATE rooms
    SET name        = 'Sala de Estudos',
        description = 'Lounge elegante - decoracao roxa e dourada',
        tags        = 'estudo,trabalho,lounge',
        is_public   = '1',
        is_staff_picked = '0'
    WHERE id = 50;

DELETE FROM navigator_publics WHERE room_id = 50;
INSERT INTO navigator_publics (public_cat_id, room_id, visible) VALUES (1, 50, '1');
