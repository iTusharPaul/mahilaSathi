import {
  NEXCONN_CUSTOM_MESSAGE_TYPES,
  TripStartedPayload,
  CheckinPayload,
  ImOkPayload,
  ArrivedPayload,
  GuardianSosPayload,
  JourneyRoomSosPayload,
  HavenCardPayload,
  ReportPayload,
  LivePingPayload,
} from '../lib/config.js';

export function isTripStartedPayload(content: any): content is TripStartedPayload {
  return content && typeof content.tripId === 'string' && typeof content.originArea === 'string';
}

export function isCheckinPayload(content: any): content is CheckinPayload {
  return content && typeof content.tripId === 'string' && typeof content.segmentLabel === 'string';
}

export function isImOkPayload(content: any): content is ImOkPayload {
  return content && typeof content.tripId === 'string';
}

export function isArrivedPayload(content: any): content is ArrivedPayload {
  return content && typeof content.tripId === 'string' && typeof content.score === 'number';
}

export function isGuardianSosPayload(content: any): content is GuardianSosPayload {
  return (
    content &&
    typeof content.tripId === 'string' &&
    typeof content.coarseArea === 'string' &&
    content.preciseCoords &&
    typeof content.preciseCoords.lat === 'number'
  );
}

export function isJourneyRoomSosPayload(content: any): content is JourneyRoomSosPayload {
  return (
    content &&
    typeof content.tripId === 'string' &&
    typeof content.coarseArea === 'string' &&
    !content.preciseCoords // Guaranteed NO precise coords
  );
}

export function isHavenCardPayload(content: any): content is HavenCardPayload {
  return content && typeof content.name === 'string' && typeof content.category === 'string';
}

export function isReportPayload(content: any): content is ReportPayload {
  return content && typeof content.category === 'string' && typeof content.segmentRef === 'string';
}

export function isLivePingPayload(content: any): content is LivePingPayload {
  return content && typeof content.tripId === 'string' && typeof content.progressPct === 'number';
}

/**
 * Safe parser for raw incoming message contents
 */
export function parseMessageContent(messageType: string, rawContent: any) {
  let content = rawContent;
  if (typeof rawContent === 'string') {
    try {
      content = JSON.parse(rawContent);
    } catch {
      content = { text: rawContent };
    }
  }

  return {
    messageType,
    content,
    isCustom: messageType.startsWith('NW:'),
  };
}
