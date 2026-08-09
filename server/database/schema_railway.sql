-- =====================================================================
-- FinSight: Budget Planner with Savings Goals
-- Database Schema for MySQL
-- =====================================================================


-- -----------------------------------------------------------
-- 1. USERS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    full_name     VARCHAR(100)    NOT NULL,
    email         VARCHAR(150)    NOT NULL UNIQUE,
    password_hash VARCHAR(255)    NOT NULL,
    currency      CHAR(3)         DEFAULT 'USD',
    preferred_currency CHAR(3)    DEFAULT 'INR',
    created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 2. CATEGORIES
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT             NOT NULL,
    name          VARCHAR(60)     NOT NULL,
    type          ENUM('income', 'expense') NOT NULL,
    icon          VARCHAR(10)     DEFAULT '📁',
    color         VARCHAR(7)      DEFAULT '#6366f1',
    created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_category (user_id, name, type)
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 3. TRANSACTIONS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT             NOT NULL,
    category_id   INT             NOT NULL,
    amount        DECIMAL(12, 2)  NOT NULL CHECK (amount > 0),
    type          ENUM('income', 'expense') NOT NULL,
    currency      CHAR(3)         DEFAULT 'INR',
    description   VARCHAR(255)    DEFAULT NULL,
    transaction_date DATE         NOT NULL,
    deleted_at    TIMESTAMP       DEFAULT NULL,
    is_bill       TINYINT(1)      DEFAULT 0,
    created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)     REFERENCES users(id)       ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id)   ON DELETE RESTRICT,

    INDEX idx_user_date (user_id, transaction_date)
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 4. SAVINGS_GOALS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS savings_goals (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    user_id         INT             NOT NULL,
    name            VARCHAR(120)    NOT NULL,
    target_amount   DECIMAL(12, 2)  NOT NULL CHECK (target_amount > 0),
    current_amount  DECIMAL(12, 2)  DEFAULT 0.00,
    auto_fund_amount DECIMAL(12, 2) DEFAULT 0.00,
    auto_fund_category_id INT       DEFAULT NULL,
    deadline        DATE            DEFAULT NULL,
    status          ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
    created_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 5. BUDGET_LIMITS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS budget_limits (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT             NOT NULL,
    category_id   INT             NOT NULL,
    monthly_limit DECIMAL(12, 2)  NOT NULL CHECK (monthly_limit > 0),
    created_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP       DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    UNIQUE KEY uq_user_category_budget (user_id, category_id)
) ENGINE=InnoDB;

-- -----------------------------------------------------------
-- 6. PASSWORD_RESET_TOKENS
-- -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT          NOT NULL,
    token_hash    VARCHAR(255) NOT NULL,
    expires_at    DATETIME     NOT NULL,
    used_at       DATETIME     DEFAULT NULL,
    created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user_tokens (user_id),
    INDEX idx_token_hash (token_hash)
) ENGINE=InnoDB;



