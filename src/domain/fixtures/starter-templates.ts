/**
 * FlowForge — Starter Workflow Templates
 * Provides editable, validated templates required by FR-060 (Expense Approval, Form Validation, Data Filtering, Notification Flow).
 */

import type { WorkflowDocument } from '../types/workflow';
import { EXPENSE_APPROVAL_WORKFLOW } from './expense-approval';

export const FORM_VALIDATION_WORKFLOW: WorkflowDocument = {
  format: 'flowforge.workflow',
  formatVersion: 1,
  id: 'wf_form_validation',
  name: 'Registration form validation',
  description:
    'Validates incoming user registration fields, checking that email is non-empty before constructing a verified user profile.',
  revision: 1,
  status: 'validated',
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:00.000Z',
  nodes: [
    {
      id: 'trigger_form',
      type: 'trigger',
      name: 'Form submitted',
      version: 1,
      position: { x: 80, y: 200 },
      config: {
        label: 'Form submitted',
        inputSchema: {
          email: 'string',
          fullName: 'string',
          role: 'string',
        },
        sampleInput: {
          email: 'grace@flowforge.dev',
          fullName: 'Grace Hopper',
          role: 'developer',
        },
      },
    },
    {
      id: 'cond_email',
      type: 'condition',
      name: 'Email present?',
      version: 1,
      position: { x: 360, y: 200 },
      config: {
        description: 'Verify email field is not empty',
        left: {
          source: 'trigger_form',
          path: 'email',
        },
        operator: 'isNotEmpty',
      },
    },
    {
      id: 'action_valid',
      type: 'action',
      name: 'Accept registration',
      version: 1,
      position: { x: 660, y: 90 },
      config: {
        label: 'Accept registration',
        actionType: 'buildObject',
        fields: {
          valid: { kind: 'literal', value: true },
          email: { kind: 'ref', source: 'trigger_form', path: 'email' },
          fullName: { kind: 'ref', source: 'trigger_form', path: 'fullName' },
        },
      },
    },
    {
      id: 'action_reject',
      type: 'action',
      name: 'Reject missing email',
      version: 1,
      position: { x: 660, y: 310 },
      config: {
        label: 'Reject missing email',
        actionType: 'buildObject',
        fields: {
          valid: { kind: 'literal', value: false },
          reason: { kind: 'literal', value: 'Email address is required' },
        },
      },
    },
    {
      id: 'end_form',
      type: 'end',
      name: 'Validation result',
      version: 1,
      position: { x: 960, y: 200 },
      config: {
        label: 'Validation result',
        outputSource: 'upstream',
        requiredFields: ['valid'],
      },
    },
  ],
  edges: [
    {
      id: 'e_form_1',
      source: 'trigger_form',
      sourceHandle: 'next',
      target: 'cond_email',
      targetHandle: 'in',
    },
    {
      id: 'e_form_true',
      source: 'cond_email',
      sourceHandle: 'true',
      target: 'action_valid',
      targetHandle: 'in',
      label: 'true',
    },
    {
      id: 'e_form_false',
      source: 'cond_email',
      sourceHandle: 'false',
      target: 'action_reject',
      targetHandle: 'in',
      label: 'false',
    },
    {
      id: 'e_form_valid_end',
      source: 'action_valid',
      sourceHandle: 'next',
      target: 'end_form',
      targetHandle: 'in',
    },
    {
      id: 'e_form_reject_end',
      source: 'action_reject',
      sourceHandle: 'next',
      target: 'end_form',
      targetHandle: 'in',
    },
  ],
};

export const DATA_FILTERING_WORKFLOW: WorkflowDocument = {
  format: 'flowforge.workflow',
  formatVersion: 1,
  id: 'wf_data_filtering',
  name: 'Telemetry priority filter',
  description:
    'Filters incoming service telemetry events by latency threshold and normalizes high-latency records for investigation.',
  revision: 1,
  status: 'validated',
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:00.000Z',
  nodes: [
    {
      id: 'trigger_telemetry',
      type: 'trigger',
      name: 'Event ingested',
      version: 1,
      position: { x: 80, y: 200 },
      config: {
        label: 'Event ingested',
        inputSchema: {
          service: 'string',
          latencyMs: 'number',
          region: 'string',
        },
        sampleInput: {
          service: 'checkout-api',
          latencyMs: 820,
          region: 'us-east',
        },
      },
    },
    {
      id: 'cond_latency',
      type: 'condition',
      name: 'High latency (> 500ms)?',
      version: 1,
      position: { x: 360, y: 200 },
      config: {
        description: 'Flag events exceeding 500ms SLA threshold',
        left: {
          source: 'trigger_telemetry',
          path: 'latencyMs',
        },
        operator: 'greaterThan',
        right: {
          kind: 'literal',
          value: 500,
        },
      },
    },
    {
      id: 'transform_alert',
      type: 'transform',
      name: 'Construct SLA breach record',
      version: 1,
      position: { x: 660, y: 90 },
      config: {
        label: 'Construct SLA breach record',
        operation: 'constructObject',
        constructedFields: {
          classification: { kind: 'literal', value: 'sla_breach' },
          service: { kind: 'ref', source: 'trigger_telemetry', path: 'service' },
          latencyMs: {
            kind: 'ref',
            source: 'trigger_telemetry',
            path: 'latencyMs',
          },
        },
      },
    },
    {
      id: 'action_normal',
      type: 'action',
      name: 'Mark healthy sample',
      version: 1,
      position: { x: 660, y: 310 },
      config: {
        label: 'Mark healthy sample',
        actionType: 'buildObject',
        fields: {
          classification: { kind: 'literal', value: 'normal' },
          service: { kind: 'ref', source: 'trigger_telemetry', path: 'service' },
          latencyMs: {
            kind: 'ref',
            source: 'trigger_telemetry',
            path: 'latencyMs',
          },
        },
      },
    },
    {
      id: 'end_filter',
      type: 'end',
      name: 'Filter output',
      version: 1,
      position: { x: 960, y: 200 },
      config: {
        label: 'Filter output',
        outputSource: 'upstream',
        requiredFields: ['classification', 'service'],
      },
    },
  ],
  edges: [
    {
      id: 'e_filt_1',
      source: 'trigger_telemetry',
      sourceHandle: 'next',
      target: 'cond_latency',
      targetHandle: 'in',
    },
    {
      id: 'e_filt_true',
      source: 'cond_latency',
      sourceHandle: 'true',
      target: 'transform_alert',
      targetHandle: 'in',
      label: 'true',
    },
    {
      id: 'e_filt_false',
      source: 'cond_latency',
      sourceHandle: 'false',
      target: 'action_normal',
      targetHandle: 'in',
      label: 'false',
    },
    {
      id: 'e_filt_alert_end',
      source: 'transform_alert',
      sourceHandle: 'next',
      target: 'end_filter',
      targetHandle: 'in',
    },
    {
      id: 'e_filt_normal_end',
      source: 'action_normal',
      sourceHandle: 'next',
      target: 'end_filter',
      targetHandle: 'in',
    },
  ],
};

export const NOTIFICATION_FLOW_WORKFLOW: WorkflowDocument = {
  format: 'flowforge.workflow',
  formatVersion: 1,
  id: 'wf_notification_flow',
  name: 'Incident notification dispatch',
  description:
    'Routes incident notifications to paging or standard digest channels based on severity level.',
  revision: 1,
  status: 'validated',
  createdAt: '2026-10-30T00:00:00.000Z',
  updatedAt: '2026-10-30T00:00:00.000Z',
  nodes: [
    {
      id: 'trigger_incident',
      type: 'trigger',
      name: 'Incident reported',
      version: 1,
      position: { x: 80, y: 200 },
      config: {
        label: 'Incident reported',
        inputSchema: {
          severity: 'string',
          summary: 'string',
          owner: 'string',
        },
        sampleInput: {
          severity: 'critical',
          summary: 'Database replica lag elevated',
          owner: 'oncall-sre',
        },
      },
    },
    {
      id: 'cond_severity',
      type: 'condition',
      name: 'Is critical?',
      version: 1,
      position: { x: 360, y: 200 },
      config: {
        description: 'Check whether incident severity equals critical',
        left: {
          source: 'trigger_incident',
          path: 'severity',
        },
        operator: 'equals',
        right: {
          kind: 'literal',
          value: 'critical',
        },
      },
    },
    {
      id: 'action_page',
      type: 'action',
      name: 'Dispatch urgent page',
      version: 1,
      position: { x: 660, y: 90 },
      config: {
        label: 'Dispatch urgent page',
        actionType: 'buildObject',
        fields: {
          channel: { kind: 'literal', value: 'pager_immediate' },
          summary: { kind: 'ref', source: 'trigger_incident', path: 'summary' },
          owner: { kind: 'ref', source: 'trigger_incident', path: 'owner' },
        },
      },
    },
    {
      id: 'action_digest',
      type: 'action',
      name: 'Queue daily digest',
      version: 1,
      position: { x: 660, y: 310 },
      config: {
        label: 'Queue daily digest',
        actionType: 'buildObject',
        fields: {
          channel: { kind: 'literal', value: 'email_digest' },
          summary: { kind: 'ref', source: 'trigger_incident', path: 'summary' },
          owner: { kind: 'ref', source: 'trigger_incident', path: 'owner' },
        },
      },
    },
    {
      id: 'end_notify',
      type: 'end',
      name: 'Dispatch recorded',
      version: 1,
      position: { x: 960, y: 200 },
      config: {
        label: 'Dispatch recorded',
        outputSource: 'upstream',
        requiredFields: ['channel', 'summary'],
      },
    },
  ],
  edges: [
    {
      id: 'e_not_1',
      source: 'trigger_incident',
      sourceHandle: 'next',
      target: 'cond_severity',
      targetHandle: 'in',
    },
    {
      id: 'e_not_true',
      source: 'cond_severity',
      sourceHandle: 'true',
      target: 'action_page',
      targetHandle: 'in',
      label: 'true',
    },
    {
      id: 'e_not_false',
      source: 'cond_severity',
      sourceHandle: 'false',
      target: 'action_digest',
      targetHandle: 'in',
      label: 'false',
    },
    {
      id: 'e_not_page_end',
      source: 'action_page',
      sourceHandle: 'next',
      target: 'end_notify',
      targetHandle: 'in',
    },
    {
      id: 'e_not_digest_end',
      source: 'action_digest',
      sourceHandle: 'next',
      target: 'end_notify',
      targetHandle: 'in',
    },
  ],
};

export const STARTER_TEMPLATES: WorkflowDocument[] = [
  EXPENSE_APPROVAL_WORKFLOW,
  FORM_VALIDATION_WORKFLOW,
  DATA_FILTERING_WORKFLOW,
  NOTIFICATION_FLOW_WORKFLOW,
];

