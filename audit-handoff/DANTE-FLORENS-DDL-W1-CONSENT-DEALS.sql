-- =============================================================================
-- Dante Florens — DDL недели 1–2 (канон ТЗ 2.0)
-- Модули: Журнал согласий (append-only) + Double-Confirm / Казна
-- Контур: только сеть домов Dante Florens
-- PostgreSQL 14+ (gen_random_uuid, EXECUTE FUNCTION)
-- =============================================================================
-- Связь: DANTE-FLORENS-TZ-2.0-MODERNIZATION.txt §4
--         DANTE-FLORENS-CROSSMARKET-AUDIT.txt U1, U4
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Неизменяемый журнал согласий (152-ФЗ / ст. 18 ФЗ «О рекламе»)
-- -----------------------------------------------------------------------------
-- Модель STOP: не UPDATE строки, а новая запись is_granted = FALSE.
-- Актуальный статус контакта = последняя строка по (contact_hash, house_id, kind).

CREATE TYPE consent_kind AS ENUM ('pdn', 'ads', 'partner_spotlight');

CREATE TABLE consent_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_hash VARCHAR(64) NOT NULL, -- SHA-256 hex от нормализованного телефона/email
    house_id UUID NOT NULL REFERENCES houses(id),
    kind consent_kind NOT NULL,
    offer_version VARCHAR(32) NOT NULL, -- напр. 'v1.0-2026-11'
    is_granted BOOLEAN NOT NULL, -- TRUE = согласие, FALSE = мгновенный STOP / отзыв
    source_channel VARCHAR(64) NOT NULL, -- 'widget', 'qr', 'email_stop_link'
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consent_lookup
    ON consent_logs (contact_hash, house_id, kind, created_at DESC);

-- Триггер запрета UPDATE/DELETE для append-only гарантии
CREATE OR REPLACE FUNCTION forbid_consent_mutation() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'consent_logs is append-only: UPDATE and DELETE are forbidden';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_consent_immutable
BEFORE UPDATE OR DELETE ON consent_logs
FOR EACH ROW EXECUTE FUNCTION forbid_consent_mutation();

-- Правило приложения + view: §3 ниже и DANTE-FLORENS-API-W1-INVARIANTS.txt §2.1
-- Публичный STOP: INSERT двух строк FALSE (ads + partner_spotlight) за одну транзакцию.


-- -----------------------------------------------------------------------------
-- 2. Протокол Double-Confirm для сделок и Казны
-- -----------------------------------------------------------------------------
-- Предпосылка: таблица deals уже существует (house_a, house_b, thread_id, …).
-- Инвесторский оборот / 8% / Data Room — только status = 'double_confirmed'.
-- Колонка суммы чека зафиксирована: amount_rub.

CREATE TYPE deal_status AS ENUM (
    'self_reported',      -- Односторонняя запись (не идет в Data Room)
    'pending_partner',    -- Ожидает акцепта второго дома
    'double_confirmed',   -- Взаимно подтверждено (база для 8% и Data Room)
    'disputed'            -- Арбитраж
);

ALTER TABLE deals
    ADD COLUMN IF NOT EXISTS status deal_status NOT NULL DEFAULT 'self_reported',
    ADD COLUMN IF NOT EXISTS house_a_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS house_b_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS network_fee_rub NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS amount_rub NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

-- double_confirmed ⇒ обе метки; fee >= 0 (нулевой чек допустим, fee = 0.00)
ALTER TABLE deals DROP CONSTRAINT IF EXISTS chk_double_confirm_integrity;
ALTER TABLE deals ADD CONSTRAINT chk_double_confirm_integrity CHECK (
    (status != 'double_confirmed') OR
    (
        house_a_confirmed_at IS NOT NULL
        AND house_b_confirmed_at IS NOT NULL
        AND network_fee_rub >= 0
    )
);

CREATE INDEX IF NOT EXISTS idx_deals_double_confirmed
    ON deals (status, house_a_confirmed_at DESC)
    WHERE status = 'double_confirmed';

-- Триггер: fee 8% и метки при переходе в double_confirmed
CREATE OR REPLACE FUNCTION fn_deals_before_save() RETURNS TRIGGER AS $$
BEGIN
    -- При создании от имени Дома-А фиксируем его подтверждение; fee = 0 до double_confirm
    IF TG_OP = 'INSERT' THEN
        IF NEW.status IN ('pending_partner', 'double_confirmed') AND NEW.house_a_confirmed_at IS NULL THEN
            NEW.house_a_confirmed_at := NOW();
        END IF;
        IF NEW.status != 'double_confirmed' THEN
            NEW.network_fee_rub := 0.00;
        END IF;
    END IF;

    -- Переход в double_confirmed: метка Дома-Б (если пусто) + 8% от amount_rub
    IF NEW.status = 'double_confirmed' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'double_confirmed') THEN
        IF NEW.house_a_confirmed_at IS NULL THEN
            NEW.house_a_confirmed_at := NOW();
        END IF;
        IF NEW.house_b_confirmed_at IS NULL THEN
            NEW.house_b_confirmed_at := NOW();
        END IF;
        NEW.network_fee_rub := ROUND(COALESCE(NEW.amount_rub, 0.00) * 0.08, 2);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_deals_before_save ON deals;
CREATE TRIGGER trg_deals_before_save
BEFORE INSERT OR UPDATE ON deals
FOR EACH ROW EXECUTE FUNCTION fn_deals_before_save();

-- ВАЖНО (приложение): не допускать INSERT status='double_confirmed' в обход
-- POST /deals/{id}/confirm от house_b — иначе триггер сам проставит обе метки.
-- Auth-слой обязан разрешать double_confirmed только после confirm вторым домом
-- (или суперадмин-арбитраж с явным аудитом).


-- -----------------------------------------------------------------------------
-- 3. Представление актуальных согласий для «Ворот Утра»
-- -----------------------------------------------------------------------------
-- can_send_ads       = последняя ads.is_granted
-- can_send_spotlight = ads TRUE И последняя partner_spotlight TRUE
-- STOP endpoint пишет FALSE в оба kind → оба флага гаснут.

CREATE OR REPLACE VIEW v_consent_current AS
WITH latest_states AS (
    SELECT DISTINCT ON (contact_hash, house_id, kind)
        contact_hash,
        house_id,
        kind,
        is_granted,
        offer_version,
        created_at
    FROM consent_logs
    ORDER BY contact_hash, house_id, kind, created_at DESC
)
SELECT
    a.contact_hash,
    a.house_id,
    a.is_granted AS can_send_ads,
    (
        a.is_granted = TRUE
        AND COALESCE(s.is_granted, FALSE) = TRUE
    ) AS can_send_spotlight,
    a.offer_version AS ads_offer_version,
    s.offer_version AS spotlight_offer_version,
    GREATEST(a.created_at, COALESCE(s.created_at, a.created_at)) AS last_updated_at
FROM latest_states a
LEFT JOIN latest_states s
    ON s.contact_hash = a.contact_hash
    AND s.house_id = a.house_id
    AND s.kind = 'partner_spotlight'
WHERE a.kind = 'ads';

-- Использование воркером утра (псевдо):
--   письмо без спотлайта:  WHERE can_send_ads = TRUE
--   письмо со спотлайтом: WHERE can_send_spotlight = TRUE
-- Нет строки в view (нет ads-записи) = нельзя слать.

-- =============================================================================
