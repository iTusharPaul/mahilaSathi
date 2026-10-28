import { CLIENT_CONFIG } from './config.js';
import { AuthResponseDTO, CircleDTO, UserDTO } from '@nightwise/shared';

class ApiClient {
  private baseUrl = CLIENT_CONFIG.API_BASE_URL;

  private getHeaders(): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = typeof localStorage !== 'undefined' ? localStorage.getItem('nw_jwt') : null;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(errBody.error || `Request failed with status ${res.status}`);
    }

    return res.json();
  }

  // --- Auth ---
  async requestOtp(phone: string): Promise<{ success: boolean; demoOtp?: string }> {
    return this.request('/auth/request-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  }

  async verifyOtp(phone: string, code: string): Promise<AuthResponseDTO> {
    return this.request('/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
  }

  async getMe(): Promise<{ user: UserDTO }> {
    return this.request('/auth/me');
  }

  async updateHandle(handle: string): Promise<{ user: UserDTO; jwt: string }> {
    return this.request('/auth/me/handle', {
      method: 'PATCH',
      body: JSON.stringify({ handle }),
    });
  }

  // --- Circles ---
  async getCircle(): Promise<{ circle: CircleDTO | null }> {
    return this.request('/circles');
  }

  async createCircle(): Promise<{ circle: CircleDTO }> {
    return this.request('/circles', {
      method: 'POST',
    });
  }

  async inviteGuardian(params: { phone?: string; handle?: string }): Promise<{ success: boolean; member: any }> {
    const circle = await this.getCircle();
    if (!circle.circle) throw new Error('No circle found');
    return this.request(`/circles/${circle.circle.id}/invite`, {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async removeCircleMember(circleId: string, userId: string): Promise<{ success: boolean }> {
    return this.request(`/circles/${circleId}/members/${userId}`, {
      method: 'DELETE',
    });
  }

  // --- Reports & Blocks ---
  async submitReport(params: { targetType: string; targetId: string; channelId?: string; reason: string }): Promise<{ success: boolean }> {
    return this.request('/reports', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async blockUser(blockedUserId: string): Promise<{ success: boolean }> {
    return this.request('/reports/block', {
      method: 'POST',
      body: JSON.stringify({ blockedUserId }),
    });
  }

  async getBlockedUsers(): Promise<{ blocked: Array<{ userId: string; handle: string }> }> {
    return this.request('/reports/blocked');
  }

  // --- Community Reports ---
  async submitCommunityReport(params: { category: string; segmentId: string; areaLabel: string; note?: string }): Promise<any> {
    return this.request('/community-reports', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // --- Plan & Routing ---
  async planTrip(params: { originText?: string; destText?: string; originCoords?: [number, number]; destCoords?: [number, number]; mode: 'walk' | 'drive' }): Promise<any> {
    return this.request('/plan', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // --- Trips ---
  async startTrip(params: { planId: string; routeId: string }): Promise<any> {
    return this.request('/trips', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async endTrip(tripId: string, status: 'arrived' | 'cancelled'): Promise<any> {
    return this.request(`/trips/${tripId}/end`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  async checkinTrip(tripId: string): Promise<any> {
    return this.request(`/trips/${tripId}/checkin`, {
      method: 'POST',
    });
  }

  async triggerSos(tripId: string, coarsePayload: any): Promise<any> {
    return this.request('/sos', {
      method: 'POST',
      body: JSON.stringify({ tripId, payload: coarsePayload }),
    });
  }

  // --- Neighbourhoods ---
  async getNeighbourhoods(): Promise<{ neighbourhoods: any[] }> {
    return this.request('/neighbourhoods');
  }

  // --- Walk Together ---
  async checkDmPermission(targetUserId: string): Promise<{ allowed: boolean; reason?: string; context?: string }> {
    return this.request('/walk-together/check-dm-permission', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    });
  }

  async getPendingWalkRequests(): Promise<{ requests: any[] }> {
    return this.request('/walk-together/requests');
  }

  async getActiveWalkChats(): Promise<{ partners: any[] }> {
    return this.request('/walk-together/active-chats');
  }

  async getCorridorMembers(corridorKey: string): Promise<{ members: any[] }> {
    return this.request(`/trips/corridors/${encodeURIComponent(corridorKey)}/members`);
  }

  async getTrip(tripId: string): Promise<{ trip: any }> {
    return this.request(`/trips/${tripId}`);
  }

  async requestWalkTogether(params: { targetId: string; targetHandle: string; corridorKey: string; havenName: string; havenCoords: { lat: number; lon: number } }): Promise<any> {
    return this.request('/walk-together/request', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async respondWalkTogether(requestId: string, accept: boolean): Promise<any> {
    return this.request('/walk-together/respond', {
      method: 'POST',
      body: JSON.stringify({ requestId, accept }),
    });
  }
}

export const api = new ApiClient();
