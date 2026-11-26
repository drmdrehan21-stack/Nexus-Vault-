/**
 * NEXUS VAULT — Google Apps Script Backend API
 * Tagline: Save Today. Secure Tomorrow.
 *
 * Database: Google Sheets ("Nexus Vault Database")
 * Worksheets:
 *   1. Transactions (ID, Date, Amount, Note, CreatedAt)
 *   2. Goals        (GoalID, GoalName, TargetAmount, CreatedAt, UpdatedAt)
 *   3. Settings     (Key, Value)
 *
 * Setup Instructions:
 *   1. Paste this entire file into Code.gs in Google Apps Script and click Save (Ctrl+S / Cmd+S).
 *   2. Select "setupNexusVault" from the top function dropdown and click Run.
 *   3. Approve permissions, then copy VAULT_ACCESS_KEY from the Execution Log
 *      (or set VAULT_ACCESS_KEY in Project Settings -> Script Properties).
 *   4. Deploy -> New deployment (or Manage deployments -> Edit -> New version) -> Web app:
 *      Execute as: Me | Who has access: Anyone.
 *
 * Security Model:
 *   - Keep the Google Spreadsheet completely PRIVATE (do not share publicly).
 *   - Every POST request requires VAULT_ACCESS_KEY verified against Script Properties.
 *   - Requests use HTTP POST with Content-Type: text/plain;charset=utf-8 to avoid
 *     browser CORS preflight (OPTIONS) failures on Google Apps Script Web Apps.
 */

var SHEET_NAMES = {
  TRANSACTIONS: 'Transactions',
  GOALS: 'Goals',
  SETTINGS: 'Settings',
};

var HEADERS = {
  TRANSACTIONS: ['ID', 'Date', 'Amount', 'Note', 'CreatedAt'],
  GOALS: ['GoalID', 'GoalName', 'TargetAmount', 'CreatedAt', 'UpdatedAt'],
  SETTINGS: ['Key', 'Value'],
};

var ALLOWED_CURRENCIES = ['INR', 'USD', 'EUR', 'GBP'];
var CURRENCY_SYMBOLS = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};
var LOCK_TIMEOUT_MS = 15000;
var IDEMPOTENCY_TTL_SECONDS = 300; // 5 minutes
var MAX_PIN_ATTEMPTS = 5;
var PIN_LOCKOUT_MS = 5 * 60 * 1000; // 5 minutes
var PIN_HASH_ROUNDS = 10000;

/**
 * ONE-TIME SETUP FUNCTION
 * After pasting Code.gs, press Save (Ctrl+S / Cmd+S) so "setupNexusVault"
 * appears in the Apps Script function dropdown, then select and Run it once.
 *
 * Actions performed:
 *   1. Uses the bound spreadsheet (renamed to "Nexus Vault Database") or creates one.
 *   2. Creates Transactions, Goals, and Settings worksheets with headers.
 *   3. Initializes default currency = INR in Settings.
 *   4. Generates and stores VAULT_ACCESS_KEY in Script Properties (if not already set).
 */
function setupNexusVault() {
  var props = PropertiesService.getScriptProperties();
  var ss = getOrCreateDatabase_(props);

  initializeDatabaseSheets_(ss);

  var accessKey = props.getProperty('VAULT_ACCESS_KEY');
  if (!accessKey) {
    accessKey = 'NV-' + Utilities.getUuid().replace(/-/g, '').slice(0, 20).toUpperCase();
    props.setProperty('VAULT_ACCESS_KEY', accessKey);
    Logger.log('==========================================================');
    Logger.log('NEW VAULT_ACCESS_KEY GENERATED (save this securely):');
    Logger.log(accessKey);
    Logger.log('You can also update it in Project Settings -> Script Properties.');
    Logger.log('==========================================================');
  } else {
    Logger.log('VAULT_ACCESS_KEY is already configured in Script Properties.');
  }

  Logger.log('Database Spreadsheet Name: ' + ss.getName());
  Logger.log('Database Spreadsheet ID: ' + ss.getId());
  Logger.log('Worksheets verified: Transactions, Goals, Settings');
  Logger.log('Setup complete.');

  return {
    ok: true,
    success: true,
    spreadsheetName: ss.getName(),
    spreadsheetId: ss.getId(),
    sheets: [SHEET_NAMES.TRANSACTIONS, SHEET_NAMES.GOALS, SHEET_NAMES.SETTINGS],
  };
}

/**
 * Health check endpoint (non-sensitive; never returns financial data).
 */
function doGet() {
  var currency = 'INR';
  try {
    var ss = getDatabase_();
    var settings = readSettingsMap_(getSheet_(ss, SHEET_NAMES.SETTINGS));
    currency = normalizeCurrency_(settings.currency);
  } catch (e) {
    // Keep health check resilient even before setupNexusVault() is run
  }

  return successResponse_({
    service: 'Nexus Vault API',
    status: 'online',
    currency: currency,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Primary API endpoint.
 * Expects JSON payload inside text/plain POST body:
 * {
 *   "action": "getBootstrapData" | "getTransactions" | "addTransaction" | ...,
 *   "accessKey": "<VAULT_ACCESS_KEY>",
 *   "requestId": "<optional-unique-id-for-idempotency>",
 *   "payload": { ... }
 * }
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return errorResponse_('INVALID_REQUEST', 'Request body is empty.');
    }

    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return errorResponse_('INVALID_JSON', 'Request body must be valid JSON.');
    }

    if (!body || typeof body !== 'object') {
      return errorResponse_('INVALID_REQUEST', 'Invalid request structure.');
    }

    // Verify personal Vault Access Key
    var authCheck = verifyAccessKey_(body.accessKey);
    if (!authCheck.ok) {
      return errorResponse_(authCheck.code, authCheck.message);
    }

    var action = String(body.action || '').trim();
    var payload = {};
    var k;
    for (k in body) {
      if (Object.prototype.hasOwnProperty.call(body, k) && k !== 'action' && k !== 'accessKey' && k !== 'requestId' && k !== 'payload') {
        payload[k] = body[k];
      }
    }
    if (body.payload && typeof body.payload === 'object') {
      for (k in body.payload) {
        if (Object.prototype.hasOwnProperty.call(body.payload, k)) {
          payload[k] = body.payload[k];
        }
      }
    }
    var requestId = body.requestId ? String(body.requestId).trim() : '';

    if (!action) {
      return errorResponse_('MISSING_ACTION', 'API action is required.');
    }

    switch (action) {
      case 'verifyAuth':
      case 'getBootstrapData':
        return handleGetBootstrapData_(payload);

      case 'getTransactions':
        return handleGetTransactions_();

      case 'addTransaction':
        return handleAddTransaction_(payload, requestId);

      case 'updateTransaction':
      case 'editTransaction':
        return handleUpdateTransaction_(payload);

      case 'deleteTransaction':
        return handleDeleteTransaction_(payload);

      case 'getTotalSavings':
        return handleGetTotalSavings_();

      case 'getMonthlySavings':
        return handleGetMonthlySavings_(payload);

      case 'getDateWiseSavings':
        return handleGetDateWiseSavings_();

      case 'getCurrentGoal':
        return handleGetCurrentGoal_();

      case 'upsertGoal':
      case 'saveGoal':
        return handleUpsertGoal_(payload, requestId);

      case 'getCalendarActivity':
        return handleGetCalendarActivity_(payload);

      case 'getSettings':
        return handleGetSettings_();

      case 'updateSettings':
        return handleUpdateSettings_(payload);

      case 'getPinStatus':
        return handleGetPinStatus_();

      case 'setupPin':
        return handleSetupPin_(payload);

      case 'verifyPin':
        return handleVerifyPin_(payload);

      case 'changePin':
        return handleChangePin_(payload);

      default:
        return errorResponse_('UNKNOWN_ACTION', 'Unsupported POST action: "' + action + '"');
    }
  } catch (err) {
    return errorResponse_(
      'INTERNAL_ERROR',
      err && err.message ? err.message : 'An unexpected server error occurred.'
    );
  }
}

/* ============================================================================
 * ACTION HANDLERS
 * ==========================================================================*/

function handleGetBootstrapData_(payload) {
  var ss = getDatabase_();
  var transactions = readAllTransactions_(ss);
  var totalSavings = sumTransactions_(transactions);
  var now = new Date();
  var yearMonth = resolveYearMonth_(payload, now);

  var currentGoal = buildGoalResponse_(readLatestGoal_(ss), totalSavings);
  var settings = readSettingsMap_(getSheet_(ss, SHEET_NAMES.SETTINGS));
  var currency = normalizeCurrency_(settings.currency);
  var monthlySummary = computeMonthlySummary_(transactions, now.getFullYear(), now.getMonth() + 1);
  var calendarActivity = computeCalendarActivity_(transactions, yearMonth.year, yearMonth.month);
  var dateWiseSavings = computeDateWiseSavings_(transactions);

  return successResponse_({
    transactions: transactions,
    totalSavings: totalSavings,
    currentGoal: currentGoal,
    settings: {
      currency: currency,
      currencySymbol: CURRENCY_SYMBOLS[currency] || '₹',
    },
    thisMonth: monthlySummary,
    calendarActivity: calendarActivity,
    dateWiseSavings: dateWiseSavings,
  });
}

function handleGetTransactions_() {
  var ss = getDatabase_();
  var transactions = readAllTransactions_(ss);
  var settings = readSettingsMap_(getSheet_(ss, SHEET_NAMES.SETTINGS));
  var currency = normalizeCurrency_(settings.currency);

  return successResponse_({
    currency: currency,
    count: transactions.length,
    transactions: transactions,
  });
}

function handleAddTransaction_(payload, requestId) {
  var amount = validateAmount_(payload.amount);
  if (!amount.ok) return errorResponse_('VALIDATION_ERROR', amount.message);

  var dateCheck = validateDateString_(payload.date);
  if (!dateCheck.ok) return errorResponse_('VALIDATION_ERROR', dateCheck.message);

  var note = sanitizeNote_(payload.note);

  return withScriptLock_(function () {
    // Prevent duplicate submissions using requestId cache
    if (requestId) {
      var cache = CacheService.getScriptCache();
      var cached = cache.get('req_' + requestId);
      if (cached) {
        return jsonOutput_(JSON.parse(cached));
      }
    }

    var ss = getDatabase_();
    var sheet = getSheet_(ss, SHEET_NAMES.TRANSACTIONS);
    var id = 'TXN-' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
    var createdAt = new Date().toISOString();

    var nextRow = sheet.getLastRow() + 1;
    var range = sheet.getRange(nextRow, 1, 1, 5);
    // Force plain text '@' on ID, Date, Note, CreatedAt so Sheets never auto-converts Date
    sheet.getRange(nextRow, 1, 1, 2).setNumberFormat('@');
    sheet.getRange(nextRow, 4, 1, 2).setNumberFormat('@');
    range.setValues([[id, dateCheck.value, amount.value, note, createdAt]]);
    SpreadsheetApp.flush();

    var created = {
      id: id,
      date: dateCheck.value,
      amount: amount.value,
      note: note,
      createdAt: createdAt,
    };

    var nowIso = new Date().toISOString();
    var responseObj = {
      ok: true,
      success: true,
      timestamp: nowIso,
      data: {
        transaction: created,
      },
      meta: { timestamp: nowIso },
    };

    if (requestId) {
      CacheService.getScriptCache().put(
        'req_' + requestId,
        JSON.stringify(responseObj),
        IDEMPOTENCY_TTL_SECONDS
      );
    }

    return jsonOutput_(responseObj);
  });
}

function handleUpdateTransaction_(payload) {
  var id = String(payload.id || '').trim();
  if (!id) {
    return errorResponse_('MISSING_ID', 'Transaction "id" is required to update a transaction.');
  }

  var amount = validateAmount_(payload.amount);
  if (!amount.ok) return errorResponse_('VALIDATION_ERROR', amount.message);

  var dateCheck = validateDateString_(payload.date);
  if (!dateCheck.ok) return errorResponse_('VALIDATION_ERROR', dateCheck.message);

  var note = sanitizeNote_(payload.note);

  return withScriptLock_(function () {
    var ss = getDatabase_();
    var sheet = getSheet_(ss, SHEET_NAMES.TRANSACTIONS);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return errorResponse_('NOT_FOUND', 'Transaction record was not found.');
    }

    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var targetRowIndex = -1;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === id) {
        targetRowIndex = i + 2;
        break;
      }
    }

    if (targetRowIndex === -1) {
      return errorResponse_('NOT_FOUND', 'Transaction record was not found.');
    }

    var createdAt = normalizeSheetTimestamp_(sheet.getRange(targetRowIndex, 5).getValue());
    sheet.getRange(targetRowIndex, 2).setNumberFormat('@').setValue(dateCheck.value);
    sheet.getRange(targetRowIndex, 3).setValue(amount.value);
    sheet.getRange(targetRowIndex, 4).setNumberFormat('@').setValue(note);
    SpreadsheetApp.flush();

    return successResponse_({
      transaction: {
        id: id,
        date: dateCheck.value,
        amount: amount.value,
        note: note,
        createdAt: createdAt,
      },
    });
  });
}

function handleDeleteTransaction_(payload) {
  var id = String(payload.id || '').trim();
  if (!id) {
    return errorResponse_('MISSING_ID', 'Transaction "id" is required to delete a transaction.');
  }

  return withScriptLock_(function () {
    var ss = getDatabase_();
    var sheet = getSheet_(ss, SHEET_NAMES.TRANSACTIONS);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return errorResponse_('NOT_FOUND', 'Transaction record was not found.');
    }

    var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var targetRowIndex = -1;
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]).trim() === id) {
        targetRowIndex = i + 2;
        break;
      }
    }

    if (targetRowIndex === -1) {
      return errorResponse_('NOT_FOUND', 'Transaction record was not found.');
    }

    sheet.deleteRow(targetRowIndex);
    SpreadsheetApp.flush();

    return successResponse_({
      deletedId: id,
    });
  });
}

function handleGetTotalSavings_() {
  var ss = getDatabase_();
  var transactions = readAllTransactions_(ss);
  var settings = readSettingsMap_(getSheet_(ss, SHEET_NAMES.SETTINGS));
  var currency = normalizeCurrency_(settings.currency);

  return successResponse_({
    currency: currency,
    currencySymbol: CURRENCY_SYMBOLS[currency] || '₹',
    totalSavings: sumTransactions_(transactions),
    transactionCount: transactions.length,
  });
}

function handleGetMonthlySavings_(payload) {
  var now = new Date();
  var yearMonth = resolveYearMonth_(payload, now);
  var ss = getDatabase_();
  var transactions = readAllTransactions_(ss);
  var settings = readSettingsMap_(getSheet_(ss, SHEET_NAMES.SETTINGS));
  var currency = normalizeCurrency_(settings.currency);
  var summary = computeMonthlySummary_(transactions, yearMonth.year, yearMonth.month);

  return successResponse_({
    currency: currency,
    currencySymbol: CURRENCY_SYMBOLS[currency] || '₹',
    year: summary.year,
    month: summary.month,
    monthPrefix: summary.monthPrefix,
    totalSavings: summary.totalSavings,
    monthlySavings: summary.totalSavings,
    savingDays: summary.savingDays,
    transactionCount: summary.transactionCount,
  });
}

function handleGetDateWiseSavings_() {
  var ss = getDatabase_();
  var transactions = readAllTransactions_(ss);
  return successResponse_({
    dateWiseSavings: computeDateWiseSavings_(transactions),
  });
}

function handleGetCurrentGoal_() {
  var ss = getDatabase_();
  var transactions = readAllTransactions_(ss);
  var totalSavings = sumTransactions_(transactions);
  var goal = buildGoalResponse_(readLatestGoal_(ss), totalSavings);
  var settings = readSettingsMap_(getSheet_(ss, SHEET_NAMES.SETTINGS));
  var currency = normalizeCurrency_(settings.currency);

  return successResponse_({
    currency: currency,
    currencySymbol: CURRENCY_SYMBOLS[currency] || '₹',
    hasGoal: Boolean(goal),
    goal: goal,
    totalSavings: totalSavings,
    completionPercentage: goal ? goal.completionPercentage : 0,
    remainingAmount: goal ? goal.remainingAmount : 0,
  });
}

function handleUpsertGoal_(payload, requestId) {
  var goalName = String(payload.goalName || '').trim();
  if (!goalName) {
    return errorResponse_('INVALID_GOAL_NAME', 'Field "goalName" cannot be empty.');
  }
  if (goalName.length > 100) {
    return errorResponse_('VALIDATION_ERROR', 'Goal name must be 100 characters or fewer.');
  }

  var targetCheck = validateAmount_(payload.targetAmount);
  if (!targetCheck.ok) {
    return errorResponse_('VALIDATION_ERROR', 'Target amount must be greater than zero.');
  }

  return withScriptLock_(function () {
    if (requestId) {
      var cache = CacheService.getScriptCache();
      var cached = cache.get('req_' + requestId);
      if (cached) {
        return jsonOutput_(JSON.parse(cached));
      }
    }

    var ss = getDatabase_();
    var sheet = getSheet_(ss, SHEET_NAMES.GOALS);
    var nowIso = new Date().toISOString();
    var lastRow = sheet.getLastRow();
    var goalId = String(payload.goalId || '').trim();
    var savedGoal;

    if (lastRow >= 2) {
      var rows = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
      var targetRow = 2;
      if (goalId) {
        for (var i = 0; i < rows.length; i++) {
          if (String(rows[i][0]).trim() === goalId) {
            targetRow = i + 2;
            break;
          }
        }
      }
      var existingId = String(sheet.getRange(targetRow, 1).getValue() || '').trim();
      var existingCreatedAt = normalizeSheetTimestamp_(sheet.getRange(targetRow, 4).getValue()) || nowIso;
      var finalId =
        existingId || 'GOAL-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();

      sheet.getRange(targetRow, 1, 1, 2).setNumberFormat('@');
      sheet.getRange(targetRow, 4, 1, 2).setNumberFormat('@');
      sheet.getRange(targetRow, 1, 1, 5).setValues([
        [finalId, goalName, targetCheck.value, existingCreatedAt, nowIso],
      ]);
      savedGoal = {
        goalId: finalId,
        goalName: goalName,
        targetAmount: targetCheck.value,
        createdAt: existingCreatedAt,
        updatedAt: nowIso,
      };
    } else {
      var newId = 'GOAL-' + Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
      sheet.getRange(2, 1, 1, 2).setNumberFormat('@');
      sheet.getRange(2, 4, 1, 2).setNumberFormat('@');
      sheet.getRange(2, 1, 1, 5).setValues([
        [newId, goalName, targetCheck.value, nowIso, nowIso],
      ]);
      savedGoal = {
        goalId: newId,
        goalName: goalName,
        targetAmount: targetCheck.value,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }

    SpreadsheetApp.flush();

    var transactions = readAllTransactions_(ss);
    var totalSavings = sumTransactions_(transactions);
    var goalObj = buildGoalResponse_(savedGoal, totalSavings);
    var responseObj = {
      ok: true,
      success: true,
      timestamp: nowIso,
      data: {
        goal: goalObj,
      },
      meta: { timestamp: nowIso },
    };

    if (requestId) {
      CacheService.getScriptCache().put(
        'req_' + requestId,
        JSON.stringify(responseObj),
        IDEMPOTENCY_TTL_SECONDS
      );
    }

    return jsonOutput_(responseObj);
  });
}

function handleGetCalendarActivity_(payload) {
  var now = new Date();
  var yearMonth = resolveYearMonth_(payload, now);
  var ss = getDatabase_();
  var transactions = readAllTransactions_(ss);
  var settings = readSettingsMap_(getSheet_(ss, SHEET_NAMES.SETTINGS));
  var currency = normalizeCurrency_(settings.currency);
  var activity = computeCalendarActivity_(transactions, yearMonth.year, yearMonth.month);

  return successResponse_({
    currency: currency,
    currencySymbol: CURRENCY_SYMBOLS[currency] || '₹',
    year: activity.year,
    month: activity.month,
    daysInMonth: activity.daysInMonth,
    monthlyTotal: activity.monthlyTotal,
    monthlySavings: activity.monthlyTotal,
    savingDays: activity.savingDays,
    activeDaysCount: activity.savingDays,
    days: activity.days,
    activityByDate: activity.days,
  });
}

function handleGetSettings_() {
  var ss = getDatabase_();
  var settings = readSettingsMap_(getSheet_(ss, SHEET_NAMES.SETTINGS));
  var currency = normalizeCurrency_(settings.currency);

  return successResponse_({
    currency: currency,
    currencySymbol: CURRENCY_SYMBOLS[currency] || '₹',
  });
}

function handleUpdateSettings_(payload) {
  var currency = normalizeCurrency_(payload.currency);
  if (ALLOWED_CURRENCIES.indexOf(currency) === -1) {
    return errorResponse_('VALIDATION_ERROR', 'Unsupported currency code.');
  }

  return withScriptLock_(function () {
    var ss = getDatabase_();
    var sheet = getSheet_(ss, SHEET_NAMES.SETTINGS);
    upsertSettingRow_(sheet, 'currency', currency);
    SpreadsheetApp.flush();

    return successResponse_({
      currency: currency,
      currencySymbol: CURRENCY_SYMBOLS[currency] || '₹',
    });
  });
}

/* ============================================================================
 * DATABASE INITIALIZATION & DATA ACCESS HELPERS
 * ==========================================================================*/

function getOrCreateDatabase_(props) {
  var savedId = props.getProperty('SPREADSHEET_ID');
  if (savedId) {
    try {
      return SpreadsheetApp.openById(savedId);
    } catch (e) {
      // Fallback to bound spreadsheet or create a new one below
    }
  }

  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    if (active.getName() !== 'Nexus Vault Database') {
      active.rename('Nexus Vault Database');
    }
    props.setProperty('SPREADSHEET_ID', active.getId());
    return active;
  }

  var created = SpreadsheetApp.create('Nexus Vault Database');
  props.setProperty('SPREADSHEET_ID', created.getId());
  return created;
}

function getDatabase_() {
  var props = PropertiesService.getScriptProperties();
  var ss = null;
  var savedId = props.getProperty('SPREADSHEET_ID');

  if (savedId) {
    ss = SpreadsheetApp.openById(savedId);
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (ss) {
      props.setProperty('SPREADSHEET_ID', ss.getId());
    }
  }

  if (!ss) {
    throw new Error(
      'Database not initialized. Save Code.gs and run setupNexusVault() in Google Apps Script first.'
    );
  }

  if (
    !ss.getSheetByName(SHEET_NAMES.TRANSACTIONS) ||
    !ss.getSheetByName(SHEET_NAMES.GOALS) ||
    !ss.getSheetByName(SHEET_NAMES.SETTINGS)
  ) {
    initializeDatabaseSheets_(ss);
  }

  return ss;
}

function initializeDatabaseSheets_(ss) {
  ensureSheetWithHeaders_(ss, SHEET_NAMES.TRANSACTIONS, HEADERS.TRANSACTIONS);
  ensureSheetWithHeaders_(ss, SHEET_NAMES.GOALS, HEADERS.GOALS);
  var settingsSheet = ensureSheetWithHeaders_(ss, SHEET_NAMES.SETTINGS, HEADERS.SETTINGS);

  var settingsMap = readSettingsMap_(settingsSheet);
  if (!settingsMap.currency) {
    upsertSettingRow_(settingsSheet, 'currency', 'INR');
  }

  var defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 3) {
    ss.deleteSheet(defaultSheet);
  }

  SpreadsheetApp.flush();
}

function ensureSheetWithHeaders_(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getSheet_(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ensureSheetWithHeaders_(ss, sheetName, HEADERS[sheetName.toUpperCase()]);
  }
  return sheet;
}

function readAllTransactions_(ss) {
  var sheet = getSheet_(ss, SHEET_NAMES.TRANSACTIONS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  var tz = ss.getSpreadsheetTimeZone() || 'Asia/Kolkata';
  var values = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  var list = [];

  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var id = String(row[0] || '').trim();
    var dateStr = normalizeSheetDate_(row[1], tz);
    var amountNum = Number(row[2]);
    var note = String(row[3] || '');
    var createdAt = normalizeSheetTimestamp_(row[4]);

    if (!id || !dateStr || !isFinite(amountNum) || amountNum <= 0) {
      continue;
    }

    list.push({
      id: id,
      date: dateStr,
      amount: roundCurrency_(amountNum),
      note: note,
      createdAt: createdAt,
    });
  }

  // Sort most recent first (Date descending, then CreatedAt descending)
  list.sort(function (a, b) {
    if (a.date !== b.date) {
      return a.date < b.date ? 1 : -1;
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? 1 : -1;
    }
    return 0;
  });

  return list;
}

function readLatestGoal_(ss) {
  var sheet = getSheet_(ss, SHEET_NAMES.GOALS);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return null;
  }

  var row = sheet.getRange(2, 1, 1, 5).getValues()[0];
  var goalId = String(row[0] || '').trim();
  var goalName = String(row[1] || '').trim();
  var targetAmount = Number(row[2]);

  if (!goalName || !isFinite(targetAmount) || targetAmount <= 0) {
    return null;
  }

  return {
    goalId: goalId,
    goalName: goalName,
    targetAmount: roundCurrency_(targetAmount),
    createdAt: normalizeSheetTimestamp_(row[3]),
    updatedAt: normalizeSheetTimestamp_(row[4]),
  };
}

function buildGoalResponse_(goal, totalSavings) {
  if (!goal) return null;
  var remaining = Math.max(0, roundCurrency_(goal.targetAmount - totalSavings));
  var percentage = goal.targetAmount > 0 ? Math.min(100, (totalSavings / goal.targetAmount) * 100) : 0;

  return {
    goalId: goal.goalId,
    goalName: goal.goalName,
    targetAmount: goal.targetAmount,
    currentSavings: roundCurrency_(totalSavings),
    remainingAmount: remaining,
    completionPercentage: Math.round(percentage * 10) / 10,
    isCompleted: totalSavings >= goal.targetAmount,
    createdAt: goal.createdAt,
    updatedAt: goal.updatedAt,
  };
}

function readSettingsMap_(sheet) {
  var lastRow = sheet.getLastRow();
  var map = {};
  if (lastRow < 2) return map;

  var rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    var k = String(rows[i][0] || '').trim();
    var v = String(rows[i][1] || '').trim();
    if (k) map[k] = v;
  }
  return map;
}

function upsertSettingRow_(sheet, key, value) {
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var rows = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() === key) {
        sheet.getRange(i + 2, 2).setNumberFormat('@').setValue(String(value));
        return;
      }
    }
  }
  var nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, 1, 2).setNumberFormat('@').setValues([[key, String(value)]]);
}

function sumTransactions_(transactions) {
  var total = 0;
  for (var i = 0; i < transactions.length; i++) {
    total += transactions[i].amount;
  }
  return roundCurrency_(total);
}

function computeMonthlySummary_(transactions, year, month) {
  var prefix = year + '-' + pad2_(month);
  var total = 0;
  var uniqueDays = {};
  var count = 0;

  for (var i = 0; i < transactions.length; i++) {
    var t = transactions[i];
    if (t.date.indexOf(prefix) === 0) {
      total += t.amount;
      uniqueDays[t.date] = true;
      count++;
    }
  }

  return {
    year: year,
    month: month,
    monthPrefix: prefix,
    totalSavings: roundCurrency_(total),
    savingDays: Object.keys(uniqueDays).length,
    transactionCount: count,
  };
}

function computeDateWiseSavings_(transactions) {
  var map = {};
  for (var i = 0; i < transactions.length; i++) {
    var t = transactions[i];
    if (!map[t.date]) {
      map[t.date] = {
        date: t.date,
        total: 0,
        count: 0,
      };
    }
    map[t.date].total = roundCurrency_(map[t.date].total + t.amount);
    map[t.date].count += 1;
  }
  return map;
}

function computeCalendarActivity_(transactions, year, month) {
  var prefix = year + '-' + pad2_(month);
  var daysInMonth = new Date(year, month, 0).getDate();
  var days = {};
  var monthlyTotal = 0;
  var savingDays = 0;

  for (var i = 0; i < transactions.length; i++) {
    var t = transactions[i];
    if (t.date.indexOf(prefix) === 0) {
      if (!days[t.date]) {
        days[t.date] = {
          date: t.date,
          total: 0,
          count: 0,
        };
        savingDays++;
      }
      days[t.date].total = roundCurrency_(days[t.date].total + t.amount);
      days[t.date].count += 1;
      monthlyTotal += t.amount;
    }
  }

  return {
    year: year,
    month: month,
    daysInMonth: daysInMonth,
    monthlyTotal: roundCurrency_(monthlyTotal),
    savingDays: savingDays,
    days: days,
  };
}

/* ============================================================================
 * VALIDATION, LOCKING & SECURITY HELPERS
 * ==========================================================================*/

function resolveYearMonth_(payload, now) {
  var year = parseYear_(payload.year, now.getFullYear());
  var month = parseMonth_(payload.month, now.getMonth() + 1);
  if (typeof payload.month === 'string') {
    var ymMatch = /^(\d{4})-(\d{2})$/.exec(payload.month.trim());
    if (ymMatch) {
      year = parseYear_(ymMatch[1], year);
      month = parseMonth_(ymMatch[2], month);
    }
  }
  return { year: year, month: month };
}

function verifyAccessKey_(providedKey) {
  var expected = PropertiesService.getScriptProperties().getProperty('VAULT_ACCESS_KEY');
  if (!expected) {
    return {
      ok: false,
      code: 'SETUP_REQUIRED',
      message: 'VAULT_ACCESS_KEY is not configured. Save Code.gs and run setupNexusVault() in Google Apps Script.',
    };
  }
  if (!providedKey || typeof providedKey !== 'string') {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Vault Access Key is required.',
    };
  }
  if (!constantTimeEquals_(providedKey.trim(), expected.trim())) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Invalid Vault Access Key.',
    };
  }
  return { ok: true };
}

function constantTimeEquals_(a, b) {
  var lenA = a.length;
  var lenB = b.length;
  var maxLen = Math.max(lenA, lenB);
  var diff = lenA ^ lenB;
  for (var i = 0; i < maxLen; i++) {
    var charA = i < lenA ? a.charCodeAt(i) : 0;
    var charB = i < lenB ? b.charCodeAt(i) : 0;
    diff |= charA ^ charB;
  }
  return diff === 0;
}

/* ============================================================================
 * 4-DIGIT PIN SECURITY HANDLERS (Salted Stretched SHA-256 + Lockout)
 * ==========================================================================*/

function handleGetPinStatus_() {
  var props = PropertiesService.getScriptProperties();
  var pinConfigured = Boolean(props.getProperty('VAULT_PIN_HASH') && props.getProperty('VAULT_PIN_SALT'));
  var lockState = getPinLockState_(props);

  return successResponse_({
    pinConfigured: pinConfigured,
    locked: lockState.locked,
    remainingSeconds: lockState.remainingSeconds,
    attemptsRemaining: lockState.attemptsRemaining,
    maxAttempts: MAX_PIN_ATTEMPTS,
  });
}

function handleSetupPin_(payload) {
  var pin = String(payload.pin || '').trim();
  var confirmPin = String(payload.confirmPin || '').trim();

  if (!/^\d{4}$/.test(pin)) {
    return errorResponse_('INVALID_PIN_FORMAT', 'PIN must be exactly 4 digits.');
  }
  if (pin !== confirmPin) {
    return errorResponse_('PIN_MISMATCH', 'PINs do not match.');
  }

  return withScriptLock_(function () {
    var props = PropertiesService.getScriptProperties();
    if (props.getProperty('VAULT_PIN_HASH')) {
      return errorResponse_('PIN_ALREADY_SET', 'A PIN is already configured.');
    }

    var salt = Utilities.getUuid().replace(/-/g, '');
    var hash = hashPinWithSalt_(pin, salt);

    props.setProperties({
      VAULT_PIN_SALT: salt,
      VAULT_PIN_HASH: hash,
      VAULT_PIN_ATTEMPTS: '0',
      VAULT_PIN_LOCK_UNTIL: '0',
    });

    return successResponse_({
      pinConfigured: true,
    });
  });
}

function handleVerifyPin_(payload) {
  var pin = String(payload.pin || '').trim();
  if (!/^\d{4}$/.test(pin)) {
    return errorResponse_('INVALID_PIN_FORMAT', 'Enter a 4-digit PIN.');
  }

  return withScriptLock_(function () {
    var props = PropertiesService.getScriptProperties();
    var salt = props.getProperty('VAULT_PIN_SALT') || '';
    var expectedHash = props.getProperty('VAULT_PIN_HASH') || '';

    if (!salt || !expectedHash) {
      return errorResponse_('PIN_NOT_CONFIGURED', 'PIN has not been set up yet.');
    }

    var lockState = getPinLockState_(props);
    if (lockState.locked) {
      return errorResponse_(
        'PIN_LOCKED',
        'Too many incorrect attempts. Try again in ' + lockState.remainingSeconds + ' seconds.'
      );
    }

    var candidateHash = hashPinWithSalt_(pin, salt);
    if (!constantTimeEquals_(candidateHash, expectedHash)) {
      var result = recordFailedPinAttempt_(props);
      if (result.locked) {
        return errorResponse_(
          'PIN_LOCKED',
          'Too many incorrect attempts. Try again in ' + result.remainingSeconds + ' seconds.'
        );
      }
      return errorResponse_(
        'INVALID_PIN',
        'Incorrect PIN. ' + result.attemptsRemaining + ' attempts remaining.'
      );
    }

    clearPinAttempts_(props);
    return successResponse_({
      verified: true,
    });
  });
}

function handleChangePin_(payload) {
  var currentPin = String(payload.currentPin || '').trim();
  var newPin = String(payload.newPin || '').trim();
  var confirmPin = String(payload.confirmPin || '').trim();

  if (!/^\d{4}$/.test(currentPin) || !/^\d{4}$/.test(newPin)) {
    return errorResponse_('INVALID_PIN_FORMAT', 'PINs must be exactly 4 digits.');
  }
  if (newPin !== confirmPin) {
    return errorResponse_('PIN_MISMATCH', 'New PIN and confirmation do not match.');
  }

  return withScriptLock_(function () {
    var props = PropertiesService.getScriptProperties();
    var salt = props.getProperty('VAULT_PIN_SALT') || '';
    var expectedHash = props.getProperty('VAULT_PIN_HASH') || '';

    if (!salt || !expectedHash) {
      return errorResponse_('PIN_NOT_CONFIGURED', 'PIN has not been set up yet.');
    }

    var lockState = getPinLockState_(props);
    if (lockState.locked) {
      return errorResponse_(
        'PIN_LOCKED',
        'Too many incorrect attempts. Try again in ' + lockState.remainingSeconds + ' seconds.'
      );
    }

    var currentHash = hashPinWithSalt_(currentPin, salt);
    if (!constantTimeEquals_(currentHash, expectedHash)) {
      var result = recordFailedPinAttempt_(props);
      if (result.locked) {
        return errorResponse_(
          'PIN_LOCKED',
          'Too many incorrect attempts. Try again in ' + result.remainingSeconds + ' seconds.'
        );
      }
      return errorResponse_(
        'INVALID_PIN',
        'Current PIN is incorrect. ' + result.attemptsRemaining + ' attempts remaining.'
      );
    }

    var newSalt = Utilities.getUuid().replace(/-/g, '');
    var newHash = hashPinWithSalt_(newPin, newSalt);
    props.setProperties({
      VAULT_PIN_SALT: newSalt,
      VAULT_PIN_HASH: newHash,
      VAULT_PIN_ATTEMPTS: '0',
      VAULT_PIN_LOCK_UNTIL: '0',
    });

    return successResponse_({
      changed: true,
    });
  });
}

function getPinLockState_(props) {
  var now = Date.now();
  var lockUntil = Number(props.getProperty('VAULT_PIN_LOCK_UNTIL') || '0');
  if (isFinite(lockUntil) && lockUntil > now) {
    return {
      locked: true,
      remainingSeconds: Math.ceil((lockUntil - now) / 1000),
      attemptsRemaining: 0,
    };
  }
  if (lockUntil > 0 && lockUntil <= now) {
    props.setProperties({
      VAULT_PIN_ATTEMPTS: '0',
      VAULT_PIN_LOCK_UNTIL: '0',
    });
    return {
      locked: false,
      remainingSeconds: 0,
      attemptsRemaining: MAX_PIN_ATTEMPTS,
    };
  }
  var attempts = Number(props.getProperty('VAULT_PIN_ATTEMPTS') || '0');
  if (!isFinite(attempts) || attempts < 0) attempts = 0;
  return {
    locked: false,
    remainingSeconds: 0,
    attemptsRemaining: Math.max(0, MAX_PIN_ATTEMPTS - attempts),
  };
}

function recordFailedPinAttempt_(props) {
  var attempts = Number(props.getProperty('VAULT_PIN_ATTEMPTS') || '0');
  if (!isFinite(attempts) || attempts < 0) attempts = 0;
  attempts += 1;

  if (attempts >= MAX_PIN_ATTEMPTS) {
    var lockUntil = Date.now() + PIN_LOCKOUT_MS;
    props.setProperties({
      VAULT_PIN_ATTEMPTS: String(attempts),
      VAULT_PIN_LOCK_UNTIL: String(lockUntil),
    });
    return {
      locked: true,
      remainingSeconds: Math.ceil(PIN_LOCKOUT_MS / 1000),
      attemptsRemaining: 0,
    };
  }

  props.setProperty('VAULT_PIN_ATTEMPTS', String(attempts));
  return {
    locked: false,
    remainingSeconds: 0,
    attemptsRemaining: Math.max(0, MAX_PIN_ATTEMPTS - attempts),
  };
}

function clearPinAttempts_(props) {
  props.setProperties({
    VAULT_PIN_ATTEMPTS: '0',
    VAULT_PIN_LOCK_UNTIL: '0',
  });
}

function hashPinWithSalt_(pin, salt) {
  var value = salt + ':' + pin;
  for (var i = 0; i < PIN_HASH_ROUNDS; i++) {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
    value = bytesToHex_(digest);
  }
  return value;
}

function bytesToHex_(bytes) {
  var hex = [];
  for (var i = 0; i < bytes.length; i++) {
    var b = (bytes[i] + 256) % 256;
    hex.push((b < 16 ? '0' : '') + b.toString(16));
  }
  return hex.join('');
}

function withScriptLock_(fn) {
  var lock = LockService.getScriptLock();
  var acquired = lock.tryLock(LOCK_TIMEOUT_MS);
  if (!acquired) {
    return errorResponse_('BUSY', 'Vault is processing another request. Please try again.');
  }
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function validateAmount_(raw) {
  var num = Number(raw);
  if (raw === null || raw === undefined || raw === '' || !isFinite(num) || isNaN(num)) {
    return { ok: false, message: 'Please enter a valid numeric amount.' };
  }
  if (num <= 0) {
    return { ok: false, message: 'Amount must be greater than zero.' };
  }
  if (num > 1000000000) {
    return { ok: false, message: 'Amount exceeds the maximum allowed limit.' };
  }
  return { ok: true, value: roundCurrency_(num) };
}

function validateDateString_(raw) {
  var s = String(raw || '').trim();
  var match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) {
    return { ok: false, message: 'Date must be in YYYY-MM-DD format.' };
  }
  var year = Number(match[1]);
  var month = Number(match[2]);
  var day = Number(match[3]);
  if (year < 1970 || year > 2100 || month < 1 || month > 12) {
    return { ok: false, message: 'Date is out of valid range.' };
  }
  var maxDays = new Date(year, month, 0).getDate();
  if (day < 1 || day > maxDays) {
    return { ok: false, message: 'Invalid calendar day for the selected month.' };
  }
  return { ok: true, value: s };
}

function sanitizeNote_(raw) {
  if (raw === null || raw === undefined) return '';
  return String(raw).trim().slice(0, 240);
}

function normalizeSheetDate_(value, timeZone) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, timeZone, 'yyyy-MM-dd');
  }
  var s = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  return '';
}

function normalizeSheetTimestamp_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString();
  }
  return String(value || '').trim();
}

function normalizeCurrency_(value) {
  var code = String(value || 'INR').trim().toUpperCase();
  return ALLOWED_CURRENCIES.indexOf(code) !== -1 ? code : 'INR';
}

function parseYear_(raw, fallback) {
  var n = Number(raw);
  return isFinite(n) && n >= 1970 && n <= 2100 ? Math.floor(n) : fallback;
}

function parseMonth_(raw, fallback) {
  var n = Number(raw);
  return isFinite(n) && n >= 1 && n <= 12 ? Math.floor(n) : fallback;
}

function roundCurrency_(n) {
  return Math.round(n * 100) / 100;
}

function pad2_(n) {
  return n < 10 ? '0' + n : String(n);
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function successResponse_(data) {
  var nowIso = new Date().toISOString();
  return jsonOutput_({
    ok: true,
    success: true,
    timestamp: nowIso,
    data: data,
    meta: {
      timestamp: nowIso,
    },
  });
}

function errorResponse_(code, message) {
  var nowIso = new Date().toISOString();
  return jsonOutput_({
    ok: false,
    success: false,
    timestamp: nowIso,
    error: {
      code: code,
      message: message,
    },
    meta: {
      timestamp: nowIso,
    },
  });
}
