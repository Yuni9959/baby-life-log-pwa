(function () {
  "use strict";

  const TYPES = ["feeding", "burp", "diaper", "sleep", "wake"];

  const ANALYSIS_CONFIG = {
    intervals: {
      sleep: { minMinutes: 5, maxMinutes: 720 },
      feedToBurp: { minMinutes: 0, maxMinutes: 120, recommendedMaxMinutes: 60 },
      feedToFeed: { minMinutes: 20, maxMinutes: 480 },
      diaperUrine: { minMinutes: 10, maxMinutes: 720 },
      diaperStool: { minMinutes: 10, maxMinutes: 2880 },
      diaperAny: { minMinutes: 10, maxMinutes: 720 },
      burpToDiaper: { minMinutes: 0, maxMinutes: 360 }
    },
    samples: {
      minSamplesForAnalysis: 5,
      minSamplesForTrend: 10,
      minSamplesForHighConfidence: 20,
      minimumBaselineSamples: 10,
      minimumTimeSlotBaselineSamples: 5
    },
    outlier: { trimPercentSmall: 0.10, trimPercentDefault: 0.20, stdMultiplier: 1.5 },
    baseline: { primaryBaselineDays: 14, fallbackBaselineDays: 30 },
    confidence: {
      recentDaysWindow: 7,
      minRecentRecordsForStableConfidence: 3,
      sleepPairingRateThreshold: 0.60,
      feedBurpPairingRateThreshold: 0.50,
      diaperSubtypeMissingThreshold: 0.40
    },
    timeSlots: [
      { key: "dawn", label: "새벽", startHour: 0, endHour: 6 },
      { key: "morning", label: "오전", startHour: 6, endHour: 12 },
      { key: "afternoon", label: "오후", startHour: 12, endHour: 18 },
      { key: "night", label: "밤", startHour: 18, endHour: 24 }
    ]
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function durationText(totalMinutes) {
    if (totalMinutes === null || totalMinutes === undefined) return "n/a";
    const minutes = Math.max(0, Math.floor(totalMinutes));
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours ? hours + "시간 " + mins + "분" : mins + "분";
  }

  function formatDateTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate()) + " " + pad(date.getHours()) + ":" + pad(date.getMinutes());
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function roundStat(value) {
    return value === null || value === undefined || Number.isNaN(value) ? null : Math.round(value * 10) / 10;
  }

  function hasDeletedMarker(record) {
    return !!(record && (record.deletedAt || record.deleted_at));
  }

  function isSampleOrDiagnosticRecord(record) {
    if (!record || typeof record !== "object") return false;
    const id = String(record.id || record.client_id || record.clientId || record.record_id || record.recordId || "");
    return record.type === "test" || record.isSample === true || record.is_sample === true || record.subtype === "connection" || id.indexOf("diagnostic_record_") === 0 || id.indexOf("test_record_") === 0;
  }

  function analysisRecordBabyId(record) {
    if (!record || typeof record !== "object") return null;
    return record.babyId || record.baby_id || (record.cloud && (record.cloud.babyId || record.cloud.baby_id)) || null;
  }

  function getRecordTime(record) {
    if (!record || typeof record !== "object") return null;
    const value = record.createdAt || record.recordedAt || record.recorded_at || record.created_at || record.timestamp || record.time;
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getRecordType(record) {
    const raw = record && (record.type || record.event_type || record.record_type);
    const value = String(raw || "").trim();
    if (value === "feed") return "feeding";
    if (value === "pee" || value === "poop") return "diaper";
    return TYPES.indexOf(value) !== -1 ? value : "";
  }

  function normalizeDiaperSubtype(value) {
    const subtype = String(value || "").trim();
    if (subtype === "pee") return "urine";
    if (subtype === "poop") return "stool";
    if (subtype === "mixed") return "both";
    return ["urine", "stool", "both", "change"].indexOf(subtype) !== -1 ? subtype : "";
  }

  function getRecordSubtype(record) {
    const value = record && (record.subtype || record.diaperType || record.diaper_type);
    if (!value) return "";
    if (getRecordType(record) === "diaper") return normalizeDiaperSubtype(value);
    return String(value).trim();
  }

  function getFeedAmount(record) {
    const value = record && (record.amount !== undefined ? record.amount : (record.feedAmount !== undefined ? record.feedAmount : (record.feed_amount !== undefined ? record.feed_amount : record.ml)));
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function getTimeSlot(date, config) {
    const hour = date.getHours();
    const slot = config.timeSlots.find(function (item) {
      return hour >= item.startHour && hour < item.endHour;
    });
    return slot ? slot.key : "unknown";
  }

  function minutesBetween(startAt, endAt) {
    return Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  }

  function sortRecordsByTime(records) {
    return (records || []).slice().sort(function (a, b) {
      return getRecordTime(a) - getRecordTime(b);
    });
  }

  function getAnalysisRecords(records, currentBabyId) {
    const source = Array.isArray(records) ? records : [];
    const babyId = currentBabyId ? String(currentBabyId) : "";
    return sortRecordsByTime(source.filter(function (record) {
      if (!record || hasDeletedMarker(record) || isSampleOrDiagnosticRecord(record)) return false;
      if (!getRecordTime(record) || !getRecordType(record)) return false;
      if (!babyId) return false;
      return String(analysisRecordBabyId(record) || "") === babyId;
    }));
  }

  function intervalReason(minutes, rule) {
    if (!Number.isFinite(minutes)) return "missingEndEvent";
    if (minutes < rule.minMinutes) return "tooShort";
    if (minutes > rule.maxMinutes) return "tooLong";
    return null;
  }

  function makePair(type, startRecord, endRecord, intervalKey, isValid, reason, config, extra) {
    const startAt = getRecordTime(startRecord);
    const endAt = endRecord ? getRecordTime(endRecord) : null;
    const intervalMinutes = startAt && endAt ? minutesBetween(startAt, endAt) : null;
    return Object.assign({
      type: type,
      startRecordId: startRecord && (startRecord.id || startRecord.record_id || startRecord.client_id),
      endRecordId: endRecord && (endRecord.id || endRecord.record_id || endRecord.client_id),
      startAt: startAt ? startAt.toISOString() : null,
      endAt: endAt ? endAt.toISOString() : null,
      intervalMinutes: intervalMinutes,
      isValid: !!isValid,
      exclusionReason: reason || null,
      timeSlot: startAt ? getTimeSlot(startAt, config) : "unknown",
      intervalKey: intervalKey
    }, extra || {});
  }

  function buildSleepSessions(records, config) {
    const rule = config.intervals.sleep;
    const items = [];
    let activeSleep = null;
    records.filter(function (record) {
      const type = getRecordType(record);
      return type === "sleep" || type === "wake";
    }).forEach(function (record) {
      const type = getRecordType(record);
      if (type === "sleep") {
        if (activeSleep) items.push(makePair("sleep_session", activeSleep, null, "sleep_duration", false, "missingEndEvent", config));
        activeSleep = record;
        return;
      }
      if (!activeSleep) {
        items.push(makePair("sleep_session", record, null, "sleep_duration", false, "missingStartEvent", config));
        return;
      }
      const minutes = minutesBetween(getRecordTime(activeSleep), getRecordTime(record));
      const reason = intervalReason(minutes, rule);
      items.push(makePair("sleep_session", activeSleep, record, "sleep_duration", !reason, reason, config));
      activeSleep = null;
    });
    if (activeSleep) items.push(makePair("sleep_session", activeSleep, null, "sleep_duration", false, "missingEndEvent", config));
    return items;
  }

  function buildFeedBurpSessions(records, config) {
    const rule = config.intervals.feedToBurp;
    const items = [];
    const candidates = records.filter(function (record) {
      const type = getRecordType(record);
      return type === "feeding" || type === "burp";
    });
    for (let i = 0; i < candidates.length; i += 1) {
      const feed = candidates[i];
      if (getRecordType(feed) !== "feeding") continue;
      let match = null;
      let reason = "missingEndEvent";
      for (let j = i + 1; j < candidates.length; j += 1) {
        const next = candidates[j];
        const nextType = getRecordType(next);
        if (nextType === "feeding") {
          reason = "nextFeedBeforeBurp";
          break;
        }
        if (nextType === "burp") {
          const minutes = minutesBetween(getRecordTime(feed), getRecordTime(next));
          match = minutes <= rule.maxMinutes ? next : null;
          reason = match ? intervalReason(minutes, rule) : "tooLong";
          break;
        }
      }
      items.push(makePair("feed_burp_session", feed, match, "feed_to_burp", !!match && !reason, reason, config, {
        feedRecordId: feed.id,
        burpRecordId: match && match.id,
        feedAmount: getFeedAmount(feed)
      }));
    }
    return items;
  }

  function buildFeedIntervals(records, config) {
    const rule = config.intervals.feedToFeed;
    const feeds = records.filter(function (record) { return getRecordType(record) === "feeding"; });
    const items = [];
    for (let i = 1; i < feeds.length; i += 1) {
      const previous = feeds[i - 1];
      const current = feeds[i];
      const minutes = minutesBetween(getRecordTime(previous), getRecordTime(current));
      const reason = intervalReason(minutes, rule);
      items.push(makePair("feed_interval", previous, current, "feed_interval", !reason, reason, config, {
        startAmount: getFeedAmount(previous),
        endAmount: getFeedAmount(current)
      }));
    }
    return items;
  }

  function diaperRecordMatches(record, subtype) {
    const normalized = getRecordSubtype(record);
    if (subtype === "any") return getRecordType(record) === "diaper";
    if (subtype === "urine") return normalized === "urine" || normalized === "both";
    if (subtype === "stool") return normalized === "stool" || normalized === "both";
    return false;
  }

  function buildDiaperIntervalList(records, subtype, rule, config) {
    const diapers = records.filter(function (record) { return diaperRecordMatches(record, subtype); });
    const items = [];
    for (let i = 1; i < diapers.length; i += 1) {
      const previous = diapers[i - 1];
      const current = diapers[i];
      const minutes = minutesBetween(getRecordTime(previous), getRecordTime(current));
      const reason = intervalReason(minutes, rule);
      items.push(makePair("diaper_interval", previous, current, "diaper_" + subtype, !reason, reason, config, { subtype: subtype }));
    }
    return items;
  }

  function buildDiaperIntervals(records, config) {
    return {
      urine: buildDiaperIntervalList(records, "urine", config.intervals.diaperUrine, config),
      stool: buildDiaperIntervalList(records, "stool", config.intervals.diaperStool, config),
      any: buildDiaperIntervalList(records, "any", config.intervals.diaperAny, config)
    };
  }

  function buildBurpToDiaperIntervals(records, config) {
    const rule = config.intervals.burpToDiaper;
    const items = [];
    const candidates = records.filter(function (record) {
      const type = getRecordType(record);
      return type === "burp" || type === "diaper";
    });
    for (let i = 0; i < candidates.length; i += 1) {
      const burp = candidates[i];
      if (getRecordType(burp) !== "burp") continue;
      let match = null;
      let reason = "missingEndEvent";
      for (let j = i + 1; j < candidates.length; j += 1) {
        const next = candidates[j];
        if (getRecordType(next) !== "diaper") continue;
        const minutes = minutesBetween(getRecordTime(burp), getRecordTime(next));
        match = minutes <= rule.maxMinutes ? next : null;
        reason = match ? intervalReason(minutes, rule) : "tooLong";
        break;
      }
      items.push(makePair("burp_diaper_interval", burp, match, "burp_to_diaper", !!match && !reason, reason, config, {
        diaperSubtype: match ? getRecordSubtype(match) : ""
      }));
    }
    return items;
  }

  function mean(values) {
    return values.length ? values.reduce(function (sum, value) { return sum + value; }, 0) / values.length : null;
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort(function (a, b) { return a - b; });
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function std(values) {
    if (values.length < 2) return 0;
    const avg = mean(values);
    return Math.sqrt(values.reduce(function (sum, value) { return sum + Math.pow(value - avg, 2); }, 0) / values.length);
  }

  function addReason(reasons, reason, count) {
    reasons[reason] = (reasons[reason] || 0) + (count || 1);
  }

  function baseConfidence(count, config) {
    if (count < config.samples.minSamplesForAnalysis) return "insufficient";
    if (count < config.samples.minSamplesForTrend) return "low";
    if (count < config.samples.minSamplesForHighConfidence) return "medium";
    return "high";
  }

  function downgradeConfidence(level) {
    const order = ["insufficient", "low", "medium", "high"];
    const index = order.indexOf(level);
    if (index <= 0) return "insufficient";
    return order[index - 1];
  }

  function calculateIntervalStats(items, config) {
    const source = Array.isArray(items) ? items : [];
    const valid = source.filter(function (item) { return item && item.isValid && Number.isFinite(item.intervalMinutes); });
    const reasons = {};
    source.forEach(function (item) {
      if (item && item.exclusionReason) addReason(reasons, item.exclusionReason);
    });
    let used = valid.slice();
    if (valid.length >= config.samples.minSamplesForHighConfidence) {
      const sorted = valid.slice().sort(function (a, b) { return a.intervalMinutes - b.intervalMinutes; });
      const trim = Math.floor(sorted.length * config.outlier.trimPercentDefault);
      used = sorted.slice(trim, sorted.length - trim);
      if (trim > 0) addReason(reasons, "outlierTrimmed", trim * 2);
      const values = used.map(function (item) { return item.intervalMinutes; });
      const avg = mean(values);
      const deviation = std(values);
      const beforeStd = used.length;
      used = used.filter(function (item) {
        return Math.abs(item.intervalMinutes - avg) <= deviation * config.outlier.stdMultiplier;
      });
      if (beforeStd > used.length) addReason(reasons, "stdOutlier", beforeStd - used.length);
    } else if (valid.length >= config.samples.minSamplesForTrend) {
      const sortedSmall = valid.slice().sort(function (a, b) { return a.intervalMinutes - b.intervalMinutes; });
      const trimSmall = Math.floor(sortedSmall.length * config.outlier.trimPercentSmall);
      used = sortedSmall.slice(trimSmall, sortedSmall.length - trimSmall);
      if (trimSmall > 0) addReason(reasons, "outlierTrimmed", trimSmall * 2);
    }
    const values = used.map(function (item) { return item.intervalMinutes; });
    return {
      rawCount: source.length,
      pairedCount: source.filter(function (item) { return !!(item && item.endAt); }).length,
      validCount: valid.length,
      usedCount: used.length,
      excludedCount: Math.max(0, source.length - used.length),
      meanMinutes: roundStat(mean(values)),
      medianMinutes: roundStat(median(values)),
      stdMinutes: roundStat(std(values)),
      minMinutes: values.length ? Math.min.apply(null, values) : null,
      maxMinutes: values.length ? Math.max.apply(null, values) : null,
      confidenceLevel: baseConfidence(used.length, config),
      exclusionReasons: reasons
    };
  }

  function calculateConfidence(stats, context, config) {
    let level = stats.confidenceLevel;
    if (context && context.recentCount < config.confidence.minRecentRecordsForStableConfidence) level = downgradeConfidence(level);
    if (context && context.pairingRate !== null && context.pairingRate < context.pairingThreshold) level = downgradeConfidence(level);
    if (context && context.subtypeMissingRate !== null && context.subtypeMissingRate > config.confidence.diaperSubtypeMissingThreshold) level = downgradeConfidence(level);
    return level;
  }

  function recentRecordCount(records, type, now, config) {
    const start = new Date(now.getTime() - config.confidence.recentDaysWindow * 86400000);
    return records.filter(function (record) {
      const date = getRecordTime(record);
      return getRecordType(record) === type && date && date >= start;
    }).length;
  }

  function buildStats(records, sessions, now, config) {
    const sleepStartCount = records.filter(function (record) { return getRecordType(record) === "sleep"; }).length;
    const feedCount = records.filter(function (record) { return getRecordType(record) === "feeding"; }).length;
    const diaperCount = records.filter(function (record) { return getRecordType(record) === "diaper"; }).length;
    const diaperSubtypeMissing = records.filter(function (record) {
      return getRecordType(record) === "diaper" && ["urine", "stool", "both"].indexOf(getRecordSubtype(record)) === -1;
    }).length;
    const sleep = calculateIntervalStats(sessions.sleepSessions, config);
    sleep.confidenceLevel = calculateConfidence(sleep, {
      recentCount: recentRecordCount(records, "sleep", now, config),
      pairingRate: sleepStartCount ? sleep.pairedCount / sleepStartCount : null,
      pairingThreshold: config.confidence.sleepPairingRateThreshold
    }, config);
    const feedToBurp = calculateIntervalStats(sessions.feedBurpSessions, config);
    feedToBurp.confidenceLevel = calculateConfidence(feedToBurp, {
      recentCount: recentRecordCount(records, "feeding", now, config),
      pairingRate: feedCount ? feedToBurp.pairedCount / feedCount : null,
      pairingThreshold: config.confidence.feedBurpPairingRateThreshold
    }, config);
    const feedInterval = calculateIntervalStats(sessions.feedIntervals, config);
    feedInterval.confidenceLevel = calculateConfidence(feedInterval, { recentCount: recentRecordCount(records, "feeding", now, config) }, config);
    const missingRate = diaperCount ? diaperSubtypeMissing / diaperCount : null;
    const urine = calculateIntervalStats(sessions.diaperIntervals.urine, config);
    const stool = calculateIntervalStats(sessions.diaperIntervals.stool, config);
    const any = calculateIntervalStats(sessions.diaperIntervals.any, config);
    urine.confidenceLevel = calculateConfidence(urine, { recentCount: recentRecordCount(records, "diaper", now, config), subtypeMissingRate: missingRate }, config);
    stool.confidenceLevel = calculateConfidence(stool, { recentCount: recentRecordCount(records, "diaper", now, config), subtypeMissingRate: missingRate }, config);
    any.confidenceLevel = calculateConfidence(any, { recentCount: recentRecordCount(records, "diaper", now, config) }, config);
    return {
      sleep: sleep,
      feeding: { feedInterval: feedInterval, feedToBurp: feedToBurp },
      burp: { burpToDiaper: calculateIntervalStats(sessions.burpToDiaperIntervals, config) },
      diaper: { urine: urine, stool: stool, any: any }
    };
  }

  function filterItemsByWindow(items, now, days) {
    const since = new Date(now.getTime() - days * 86400000);
    return (items || []).filter(function (item) {
      const date = item && item.startAt ? new Date(item.startAt) : null;
      return item && item.isValid && date && !Number.isNaN(date.getTime()) && date >= since && date <= now;
    });
  }

  function baselineFromItems(key, label, items, now, config) {
    let windowDays = config.baseline.primaryBaselineDays;
    let source = filterItemsByWindow(items, now, windowDays);
    let fallbackUsed = false;
    if (source.length < config.samples.minimumBaselineSamples) {
      windowDays = config.baseline.fallbackBaselineDays;
      source = filterItemsByWindow(items, now, windowDays);
      fallbackUsed = true;
    }
    const stats = calculateIntervalStats(source, config);
    return {
      key: key,
      label: label,
      status: source.length >= config.samples.minimumBaselineSamples ? "ready" : "insufficient",
      windowDays: windowDays,
      fallbackUsed: fallbackUsed,
      sampleCount: source.length,
      meanMinutes: stats.meanMinutes,
      medianMinutes: stats.medianMinutes,
      confidenceLevel: stats.confidenceLevel
    };
  }

  function baselineAmount(records, now, config) {
    let windowDays = config.baseline.primaryBaselineDays;
    let since = new Date(now.getTime() - windowDays * 86400000);
    let amounts = records.filter(function (record) {
      const date = getRecordTime(record);
      const amount = getFeedAmount(record);
      return getRecordType(record) === "feeding" && date >= since && amount > 0;
    }).map(getFeedAmount);
    let fallbackUsed = false;
    if (amounts.length < config.samples.minimumBaselineSamples) {
      fallbackUsed = true;
      windowDays = config.baseline.fallbackBaselineDays;
      since = new Date(now.getTime() - windowDays * 86400000);
      amounts = records.filter(function (record) {
        const date = getRecordTime(record);
        const amount = getFeedAmount(record);
        return getRecordType(record) === "feeding" && date >= since && amount > 0;
      }).map(getFeedAmount);
    }
    return {
      key: "feed_amount",
      label: "평균 수유량",
      status: amounts.length >= config.samples.minimumBaselineSamples ? "ready" : "insufficient",
      windowDays: windowDays,
      fallbackUsed: fallbackUsed,
      sampleCount: amounts.length,
      meanMl: roundStat(mean(amounts)),
      medianMl: roundStat(median(amounts)),
      confidenceLevel: baseConfidence(amounts.length, config)
    };
  }

  function buildBaselines(records, sessions, config, now) {
    return {
      sleepSession: baselineFromItems("sleep_session", "평균 수면 세션 길이", sessions.sleepSessions, now, config),
      feedInterval: baselineFromItems("feed_interval", "평균 수유 간격", sessions.feedIntervals, now, config),
      feedAmount: baselineAmount(records, now, config),
      feedToBurp: baselineFromItems("feed_to_burp", "수유 후 트림까지 걸린 시간", sessions.feedBurpSessions, now, config),
      diaperUrine: baselineFromItems("diaper_urine", "평균 소변 간격", sessions.diaperIntervals.urine, now, config),
      diaperStool: baselineFromItems("diaper_stool", "평균 대변 간격", sessions.diaperIntervals.stool, now, config),
      diaperAny: baselineFromItems("diaper_any", "평균 기저귀 교체 간격", sessions.diaperIntervals.any, now, config),
      burpToDiaper: baselineFromItems("burp_to_diaper", "트림 후 기저귀까지 걸린 시간", sessions.burpToDiaperIntervals, now, config)
    };
  }

  function buildTimeSlotBaselines(records, sessions, config, now, globalBaselines) {
    const metrics = {
      sleepSession: sessions.sleepSessions,
      feedInterval: sessions.feedIntervals,
      feedToBurp: sessions.feedBurpSessions,
      diaperUrine: sessions.diaperIntervals.urine,
      diaperStool: sessions.diaperIntervals.stool,
      diaperAny: sessions.diaperIntervals.any,
      burpToDiaper: sessions.burpToDiaperIntervals
    };
    return Object.keys(metrics).reduce(function (result, key) {
      result[key] = {};
      const valid = filterItemsByWindow(metrics[key], now, config.baseline.fallbackBaselineDays);
      config.timeSlots.forEach(function (slot) {
        const slotItems = valid.filter(function (item) { return item.timeSlot === slot.key; });
        if (slotItems.length >= config.samples.minimumTimeSlotBaselineSamples) {
          const stats = calculateIntervalStats(slotItems, config);
          result[key][slot.key] = { status: "ready", sampleCount: slotItems.length, medianMinutes: stats.medianMinutes, confidenceLevel: stats.confidenceLevel };
        } else {
          result[key][slot.key] = {
            status: "fallback_to_global",
            sampleCount: slotItems.length,
            medianMinutes: globalBaselines[key] ? globalBaselines[key].medianMinutes : null,
            confidenceLevel: globalBaselines[key] ? globalBaselines[key].confidenceLevel : "insufficient"
          };
        }
      });
      return result;
    }, {});
  }

  function countReason(items, reason) {
    return (items || []).filter(function (item) { return item && item.exclusionReason === reason; }).length;
  }

  function detectDataQualityIssues(records, sessions, config, meta) {
    const sleepMissingWake = countReason(sessions.sleepSessions, "missingEndEvent");
    const wakeMissingSleep = countReason(sessions.sleepSessions, "missingStartEvent");
    const feedMissingBurp = sessions.feedBurpSessions.filter(function (item) {
      return item.exclusionReason === "missingEndEvent" || item.exclusionReason === "nextFeedBeforeBurp";
    }).length;
    const diaperMissingSubtype = records.filter(function (record) {
      return getRecordType(record) === "diaper" && ["urine", "stool", "both"].indexOf(getRecordSubtype(record)) === -1;
    }).length;
    const feedAmountMissing = records.filter(function (record) {
      const amount = getFeedAmount(record);
      return getRecordType(record) === "feeding" && !(amount > 0);
    }).length;
    const missing = [];
    const warnings = [];
    function pushMissing(key, count, message) {
      if (count > 0) missing.push({ key: key, severity: "info", count: count, message: message });
    }
    pushMissing("missing_wake_after_sleep", sleepMissingWake, "잠듦 기록은 있지만 깨어남 기록이 없는 경우가 있어요.");
    pushMissing("missing_sleep_before_wake", wakeMissingSleep, "깨어남 기록은 있지만 앞선 잠듦 기록을 찾기 어려운 경우가 있어요.");
    pushMissing("missing_burp_after_feed", feedMissingBurp, "수유 기록에 비해 트림 기록이 적어서 수유 후 트림 분석은 참고용이에요.");
    pushMissing("diaper_subtype_missing", diaperMissingSubtype, "기저귀 종류가 없는 기록이 있어 소변/대변 개별 분석에 일부만 반영돼요.");
    pushMissing("feed_amount_missing", feedAmountMissing, "수유량이 없는 기록은 수유량 기준선에서 제외돼요.");
    const diaperCount = records.filter(function (record) { return getRecordType(record) === "diaper"; }).length;
    const subtypeMissingRate = diaperCount ? diaperMissingSubtype / diaperCount : 0;
    if (subtypeMissingRate > config.confidence.diaperSubtypeMissingThreshold) {
      warnings.push({ key: "diaper_subtype_missing_rate_high", severity: "warning", value: roundStat(subtypeMissingRate), message: "기저귀 종류가 없는 기록이 많아 소변/대변 개별 분석은 조심스럽게 보는 게 좋아요." });
    }
    if (meta.excludedDeletedRecords > 0) warnings.push({ key: "deleted_records_excluded", severity: "info", value: meta.excludedDeletedRecords, message: "삭제된 기록은 분석에서 제외했어요." });
    if (meta.excludedOtherBabyRecords > 0) warnings.push({ key: "other_baby_records_excluded", severity: "info", value: meta.excludedOtherBabyRecords, message: "현재 아기가 아닌 기록은 분석에서 제외했어요." });
    if (!meta.babyId) warnings.push({ key: "current_baby_missing", severity: "warning", value: 1, message: "분석할 아기를 먼저 선택하면 기록을 섞지 않고 계산할 수 있어요." });
    const penalty = sleepMissingWake * 3 + wakeMissingSleep * 3 + feedMissingBurp * 2 + diaperMissingSubtype + feedAmountMissing;
    return { missing: missing, warnings: warnings, recordQualityScore: Math.max(0, Math.min(100, 100 - penalty)) };
  }

  function buildAnalysisMessages(snapshot) {
    const messages = { summary: [], sleep: [], feeding: [], diaper: [], dataQuality: [] };
    if (!snapshot.meta.validRecords) {
      messages.summary.push("분석할 기록이 아직 부족해요. 기록이 조금 더 쌓이면 평소 패턴과 비교할 수 있어요.");
      return messages;
    }
    messages.summary.push("분석 대상 기록 " + snapshot.meta.validRecords + "개를 현재 아기 기준으로 정리했어요.");
    const sleepStats = snapshot.stats.sleep;
    messages.sleep.push(sleepStats.usedCount >= 5
      ? "수면 세션은 " + sleepStats.rawCount + "개 생성됐고, 분석 신뢰도는 " + sleepStats.confidenceLevel + " 수준이에요."
      : "수면 기록이 조금 더 쌓이면 잠듦과 깨어남 흐름을 더 자연스럽게 볼 수 있어요.");
    const burpStats = snapshot.stats.feeding.feedToBurp;
    messages.feeding.push(burpStats.usedCount >= 5
      ? "수유 후 트림까지 걸린 시간은 중앙값 " + durationText(burpStats.medianMinutes || 0) + " 정도로 계산됐어요."
      : "수유 후 트림까지 걸린 시간은 아직 기록 수가 적어서 참고용으로만 봐주세요.");
    const diaperStats = snapshot.stats.diaper.any;
    messages.diaper.push(diaperStats.usedCount >= 5
      ? "기저귀 간격은 " + diaperStats.usedCount + "개 기록쌍을 기준으로 참고할 수 있어요."
      : "기저귀 간격은 기록이 조금 더 쌓이면 소변/대변 흐름까지 나누어 볼 수 있어요.");
    snapshot.dataQuality.missing.concat(snapshot.dataQuality.warnings).slice(0, 4).forEach(function (item) {
      messages.dataQuality.push(item.message);
    });
    if (!messages.dataQuality.length) messages.dataQuality.push("현재 기록 품질 점수는 " + snapshot.dataQuality.recordQualityScore + "점이에요. 기록 기반 참고 정보로만 봐주세요.");
    return messages;
  }

  function buildAnalysisSnapshot(input) {
    const options = input && input.options ? input.options : ANALYSIS_CONFIG;
    const now = input && input.now ? input.now : new Date();
    const records = Array.isArray(input && input.records) ? input.records : [];
    const babyId = input && input.currentBabyId ? String(input.currentBabyId) : "";
    const activeWithTime = records.filter(function (record) { return record && !hasDeletedMarker(record) && getRecordTime(record) && getRecordType(record); });
    const validRecords = getAnalysisRecords(records, babyId);
    const sessions = {
      sleepSessions: buildSleepSessions(validRecords, options),
      feedBurpSessions: buildFeedBurpSessions(validRecords, options),
      feedIntervals: buildFeedIntervals(validRecords, options),
      diaperIntervals: buildDiaperIntervals(validRecords, options),
      burpToDiaperIntervals: buildBurpToDiaperIntervals(validRecords, options)
    };
    const stats = buildStats(validRecords, sessions, now, options);
    const baselinesGlobal = buildBaselines(validRecords, sessions, options, now);
    const baselines = {
      global: baselinesGlobal,
      byTimeSlot: buildTimeSlotBaselines(validRecords, sessions, options, now, baselinesGlobal)
    };
    const dates = validRecords.map(getRecordTime).filter(Boolean);
    const meta = {
      babyId: babyId || null,
      generatedAt: now.toISOString(),
      totalRecords: records.length,
      validRecords: validRecords.length,
      excludedDeletedRecords: records.filter(hasDeletedMarker).length,
      excludedOtherBabyRecords: babyId ? activeWithTime.filter(function (record) { return String(analysisRecordBabyId(record) || "") !== babyId; }).length : activeWithTime.length,
      dateRange: dates.length ? { start: dates[0].toISOString(), end: dates[dates.length - 1].toISOString() } : null,
      timezoneMode: "local_display_utc_storage"
    };
    const dataQuality = detectDataQualityIssues(validRecords, sessions, options, meta);
    const diagnostics = {
      counts: {
        sleepSessions: sessions.sleepSessions.length,
        sleepValid: sessions.sleepSessions.filter(function (item) { return item.isValid; }).length,
        feedBurpSessions: sessions.feedBurpSessions.length,
        feedBurpValid: sessions.feedBurpSessions.filter(function (item) { return item.isValid; }).length,
        feedIntervals: sessions.feedIntervals.length,
        diaperUrineIntervals: sessions.diaperIntervals.urine.length,
        diaperStoolIntervals: sessions.diaperIntervals.stool.length,
        diaperAnyIntervals: sessions.diaperIntervals.any.length,
        burpToDiaperIntervals: sessions.burpToDiaperIntervals.length
      },
      exclusionReasons: {
        sleep: stats.sleep.exclusionReasons,
        feedToBurp: stats.feeding.feedToBurp.exclusionReasons,
        feedInterval: stats.feeding.feedInterval.exclusionReasons,
        diaperAny: stats.diaper.any.exclusionReasons
      }
    };
    const snapshot = { meta: meta, sessions: sessions, stats: stats, baselines: baselines, dataQuality: dataQuality, messages: {}, diagnostics: diagnostics };
    snapshot.messages = buildAnalysisMessages(snapshot);
    return snapshot;
  }

  function baselineStatusText(baselines) {
    return Object.keys(baselines || {}).map(function (key) {
      return key + ":" + ((baselines[key] && baselines[key].status) || "unknown");
    }).join(", ");
  }

  function renderAnalysisDiagnostics(snapshot) {
    if (!snapshot) return "";
    const c = snapshot.diagnostics.counts;
    const s = snapshot.stats;
    const preview = []
      .concat(snapshot.messages.summary)
      .concat(snapshot.messages.feeding)
      .concat(snapshot.messages.dataQuality)
      .slice(0, 4);
    return '<article class="analysis-card"><h3>Phase 5.0 분석 진단</h3>' +
      '<p class="analysis-summary">개발자용 count, confidence, 누락, 제외 사유 확인 패널입니다.</p>' +
      '<ul class="rhythm-list">' +
      '<li>생성 시각: ' + escapeHtml(formatDateTime(snapshot.meta.generatedAt)) + '</li>' +
      '<li>전체 records: ' + escapeHtml(snapshot.meta.totalRecords) + '개 / 분석 대상: ' + escapeHtml(snapshot.meta.validRecords) + '개 / 삭제 제외: ' + escapeHtml(snapshot.meta.excludedDeletedRecords) + '개</li>' +
      '<li>current baby_id: ' + escapeHtml(snapshot.meta.babyId || "없음") + '</li>' +
      '<li>수면 세션: ' + escapeHtml(c.sleepSessions) + '개, valid ' + escapeHtml(c.sleepValid) + '개, excluded ' + escapeHtml(s.sleep.excludedCount) + '개, confidence ' + escapeHtml(s.sleep.confidenceLevel) + '</li>' +
      '<li>수유-트림: ' + escapeHtml(c.feedBurpSessions) + '개, valid ' + escapeHtml(c.feedBurpValid) + '개, excluded ' + escapeHtml(s.feeding.feedToBurp.excludedCount) + '개, confidence ' + escapeHtml(s.feeding.feedToBurp.confidenceLevel) + '</li>' +
      '<li>수유 간격: ' + escapeHtml(c.feedIntervals) + '개, used ' + escapeHtml(s.feeding.feedInterval.usedCount) + '개, confidence ' + escapeHtml(s.feeding.feedInterval.confidenceLevel) + '</li>' +
      '<li>기저귀 간격: any ' + escapeHtml(c.diaperAnyIntervals) + '개, urine ' + escapeHtml(c.diaperUrineIntervals) + '개, stool ' + escapeHtml(c.diaperStoolIntervals) + '개, confidence ' + escapeHtml(s.diaper.any.confidenceLevel) + '</li>' +
      '<li>트림-기저귀 간격: ' + escapeHtml(c.burpToDiaperIntervals) + '개</li>' +
      '<li>개인 기준선: ' + escapeHtml(baselineStatusText(snapshot.baselines.global)) + '</li>' +
      '<li>시간대별 기준선: fallback 포함 계산됨</li>' +
      '<li>누락 감지: ' + escapeHtml(snapshot.dataQuality.missing.length) + '개 / 경고: ' + escapeHtml(snapshot.dataQuality.warnings.length) + '개 / 품질 점수: ' + escapeHtml(snapshot.dataQuality.recordQualityScore) + '</li>' +
      '<li>제외 사유 sleep: ' + escapeHtml(JSON.stringify(s.sleep.exclusionReasons)) + '</li>' +
      '<li>제외 사유 feedBurp: ' + escapeHtml(JSON.stringify(s.feeding.feedToBurp.exclusionReasons)) + '</li>' +
      '<li>문구 미리보기: ' + escapeHtml(preview.join(" ")) + '</li>' +
      '</ul></article>';
  }

  window.Phase5Analysis = {
    ANALYSIS_CONFIG: ANALYSIS_CONFIG,
    getAnalysisRecords: getAnalysisRecords,
    sortRecordsByTime: sortRecordsByTime,
    getRecordTime: getRecordTime,
    getRecordType: getRecordType,
    getRecordSubtype: getRecordSubtype,
    getFeedAmount: getFeedAmount,
    getTimeSlot: getTimeSlot,
    minutesBetween: minutesBetween,
    buildSleepSessions: buildSleepSessions,
    buildFeedBurpSessions: buildFeedBurpSessions,
    buildFeedIntervals: buildFeedIntervals,
    buildDiaperIntervals: buildDiaperIntervals,
    buildBurpToDiaperIntervals: buildBurpToDiaperIntervals,
    calculateIntervalStats: calculateIntervalStats,
    calculateConfidence: calculateConfidence,
    buildBaselines: buildBaselines,
    buildTimeSlotBaselines: buildTimeSlotBaselines,
    detectDataQualityIssues: detectDataQualityIssues,
    buildAnalysisMessages: buildAnalysisMessages,
    buildAnalysisSnapshot: buildAnalysisSnapshot,
    renderAnalysisDiagnostics: renderAnalysisDiagnostics
  };
})();
