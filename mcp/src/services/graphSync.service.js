/**
 * Graph Sync Service
 * Frontend API client for API-API selective sync (SOURCE side,
 * /api/v1/graph-transfer/push). Pairs with graphTransfer.service (export).
 */

import axios from 'axios';
import { API_BASE_URL } from '../config/api.config';

const api = axios.create({
    baseURL: `${API_BASE_URL}/graph-transfer/push`,
    headers: { 'Content-Type': 'application/json' },
});

// ── Peers ───────────────────────────────────────────────────────────────────
export const listPeers = async () => (await api.get('/peers')).data;
export const addPeer = async (peer) => (await api.post('/peers', peer)).data;
export const deletePeer = async (id) => (await api.delete(`/peers/${id}`)).data;
export const testPeer = async (id) => (await api.post(`/peers/${id}/test`)).data;
export const peerHealth = async (id) => (await api.get(`/peers/${id}/health`)).data;
export const peerRecords = async (id, limit = 50) => (await api.get(`/peers/${id}/records`, { params: { limit } })).data;

// ── Domains + Compare ───────────────────────────────────────────────────────
export const getDomains = async () => (await api.get('/domains')).data;
export const comparePeer = async (id) => (await api.get(`/peers/${id}/compare`)).data;

// ── Sync jobs ─────────────────────────────────────────────────────────────
/** Start a push job. spec: { peerId, request|stagingId, mode, conflict, catalogChannel, skipVectors, force } */
export const startSync = async (spec) => (await api.post('/jobs', spec)).data;
/** Apply a previously-planned (reviewed) staged package by its stagingId. */
export const applyStaged = async ({ peerId, stagingId, conflict, catalogChannel, skipVectors, force }) =>
    (await api.post('/jobs', { peerId, stagingId, mode: 'apply', conflict, catalogChannel, skipVectors, force })).data;
export const listSyncJobs = async (limit = 50) => (await api.get('/jobs', { params: { limit } })).data;
export const getSyncJob = async (id) => (await api.get(`/jobs/${id}`)).data;

/** SSE URL for a sync job's progress (consume via native EventSource). */
export const syncJobEventsUrl = (id) => `${API_BASE_URL}/graph-transfer/push/jobs/${id}/events`;

export default {
    listPeers, addPeer, deletePeer, testPeer, peerHealth, peerRecords,
    getDomains, comparePeer,
    startSync, applyStaged, listSyncJobs, getSyncJob, syncJobEventsUrl,
};
