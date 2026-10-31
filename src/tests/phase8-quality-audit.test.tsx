import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppShell } from '../components/shell/AppShell';
import { useWorkspaceStore } from '../store/workspace-store';
import { validateWorkflow } from '../domain/validation/graph-validator';
import { executeWorkflow } from '../engine';
import type { WorkflowDocument } from '../domain/types/workflow';

describe('Phase 8 — Responsive Layout, Accessibility & Performance Quality Audit', () => {
  it('renders mobile navigation tabs and switches active mobile viewport tab', async () => {
    const user = userEvent.setup();
    render(<AppShell />);

    const mobileNav = screen.getByRole('navigation', {
      name: 'Mobile workspace view switcher',
    });
    expect(mobileNav).toBeInTheDocument();

    const inspectorTab = screen.getByRole('button', { name: 'Inspector' });
    const traceTab = screen.getByRole('button', { name: 'Trace & Logs' });
    const canvasTab = screen.getByRole('button', { name: 'Canvas' });

    // Switch to Inspector
    await user.click(inspectorTab);
    expect(useWorkspaceStore.getState().mobileActiveTab).toBe('inspector');

    // Switch to Trace & Logs
    await user.click(traceTab);
    expect(useWorkspaceStore.getState().mobileActiveTab).toBe('trace');

    // Switch back to Canvas
    await user.click(canvasTab);
    expect(useWorkspaceStore.getState().mobileActiveTab).toBe('canvas');
  });

  it('provides accessible ARIA landmarks, roles, and labeled regions across the shell', () => {
    render(<AppShell />);

    expect(screen.getByRole('banner', { name: 'Workspace top bar' })).toBeInTheDocument();
    expect(screen.getByLabelText('Workspace navigation sidebar')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Contextual inspector' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Workflow nodes on canvas' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Execution and validation drawer' })).toBeInTheDocument();
  });

  it('scales efficiently on large workflow graphs (50+ nodes) under 100ms', () => {
    const largeDoc: WorkflowDocument = {
      format: 'flowforge.workflow',
      formatVersion: 1,
      id: 'wf_perf_large',
      name: 'Performance Test Graph (50 Nodes)',
      description: 'Stress-testing graph validation and deterministic execution throughput',
      revision: 1,
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: 'perf_trig',
          type: 'trigger',
          name: 'Trigger 0',
          version: 1,
          position: { x: 0, y: 0 },
          config: {
            label: 'Trigger 0',
            inputSchema: { value: 'number' },
            sampleInput: { value: 100 },
          },
        },
      ],
      edges: [],
    };

    // Chain 49 action nodes sequentially
    let prevId = 'perf_trig';
    for (let i = 1; i <= 48; i++) {
      const currId = `perf_act_${i}`;
      largeDoc.nodes.push({
        id: currId,
        type: 'action',
        name: `Action ${i}`,
        version: 1,
        position: { x: i * 120, y: 0 },
        config: {
          label: `Action ${i}`,
          actionType: 'buildObject',
          fields: {
            step: { kind: 'literal', value: i },
          },
        },
      });
      largeDoc.edges.push({
        id: `e_${prevId}_${currId}`,
        source: prevId,
        sourceHandle: 'next',
        target: currId,
        targetHandle: 'in',
      });
      prevId = currId;
    }

    // Terminating End node
    largeDoc.nodes.push({
      id: 'perf_end',
      type: 'end',
      name: 'End Node',
      version: 1,
      position: { x: 50 * 120, y: 0 },
      config: {
        label: 'End Node',
        outputSource: 'upstream',
      },
    });
    largeDoc.edges.push({
      id: `e_${prevId}_perf_end`,
      source: prevId,
      sourceHandle: 'next',
      target: 'perf_end',
      targetHandle: 'in',
    });

    // Validate graph performance
    const validationStart = performance.now();
    const validation = validateWorkflow(largeDoc);
    const validationTime = performance.now() - validationStart;

    expect(validation.valid).toBe(true);
    expect(validation.errorsCount).toBe(0);
    expect(validationTime).toBeLessThan(100); // Must validate in < 100ms

    // Execute graph performance
    const execStart = performance.now();
    return executeWorkflow(largeDoc, { input: { value: 42 } }).then((result) => {
      const execTime = performance.now() - execStart;
      expect(result.status).toBe('success');
      expect(Object.keys(result.nodeTraces)).toHaveLength(50);
      expect(execTime).toBeLessThan(1000); // Full 50-node execution under 1000ms
    });
  });
});
