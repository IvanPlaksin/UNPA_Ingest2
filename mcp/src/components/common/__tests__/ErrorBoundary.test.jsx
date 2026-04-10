import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import ErrorBoundary from '../ErrorBoundary';

const ThrowingComponent = ({ shouldThrow }) => {
  if (shouldThrow) throw new Error('Test error');
  return <div>Normal content</div>;
};

const originalError = console.error;
const originalWarn = console.warn;

describe('ErrorBoundary', () => {
  beforeAll(() => {
    console.error = vi.fn();
    console.warn = vi.fn();
  });

  afterAll(() => {
    console.error = originalError;
    console.warn = originalWarn;
  });

  describe('normal operation', () => {
    it('renders children when no error', () => {
      render(
        <ErrorBoundary name="Test">
          <div>Child content</div>
        </ErrorBoundary>
      );

      expect(screen.getByText('Child content')).toBeInTheDocument();
    });

    it('renders non-throwing component', () => {
      render(
        <ErrorBoundary name="Test">
          <ThrowingComponent shouldThrow={false} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Normal content')).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('renders fallback UI when child throws', () => {
      render(
        <ErrorBoundary name="TestComponent">
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Test error/)).toBeInTheDocument();
    });

    it('shows component name in error UI', () => {
      render(
        <ErrorBoundary name="MyWidget">
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/MyWidget/)).toBeInTheDocument();
    });

    it('calls onError callback', () => {
      const onError = vi.fn();

      render(
        <ErrorBoundary name="Test" onError={onError}>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0].message).toBe('Test error');
    });
  });

  describe('recovery', () => {
    it('calls onReset when retry clicked', () => {
      const onReset = vi.fn();

      render(
        <ErrorBoundary name="Test" onReset={onReset}>
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      const retryButton = screen.getByText(/Retry/i);
      fireEvent.click(retryButton);

      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('page level', () => {
    it('shows reload button for page level', () => {
      render(
        <ErrorBoundary name="Page" level="page">
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Reload page/i)).toBeInTheDocument();
    });

    it('shows "Something went wrong" for page level', () => {
      render(
        <ErrorBoundary name="Page" level="page">
          <ThrowingComponent shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });
});
