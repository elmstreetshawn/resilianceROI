import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Option, Step } from './Step';

describe('Step', () => {
  it('shows the step count by default', () => {
    render(
      <Step step={2} total={6}>
        <p>content</p>
      </Step>,
    );
    expect(screen.getByText('Step 2 of 6')).toBeInTheDocument();
  });

  it('shows a label override instead of the step count', () => {
    render(
      <Step step={6} total={6} label="Last step">
        <p>content</p>
      </Step>,
    );
    expect(screen.getByText('Last step')).toBeInTheDocument();
    expect(screen.queryByText('Step 6 of 6')).not.toBeInTheDocument();
  });

  it('disables the back button when onBack is not provided', () => {
    render(
      <Step step={1} total={6}>
        <p>content</p>
      </Step>,
    );
    expect(screen.getByLabelText('Back')).toBeDisabled();
  });

  it('calls onBack when the back button is clicked', async () => {
    const onBack = vi.fn();
    render(
      <Step step={2} total={6} onBack={onBack}>
        <p>content</p>
      </Step>,
    );
    const backBtn = screen.getByLabelText('Back');
    expect(backBtn).toBeEnabled();
    await userEvent.click(backBtn);
    expect(onBack).toHaveBeenCalledOnce();
  });
});

describe('Option', () => {
  it('calls onClick when clicked', async () => {
    const onClick = vi.fn();
    render(<Option onClick={onClick}>pick me</Option>);
    await userEvent.click(screen.getByText('pick me'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('marks itself selected', () => {
    render(
      <Option onClick={() => {}} selected>
        pick me
      </Option>,
    );
    expect(screen.getByText('pick me')).toHaveClass('option--selected');
  });
});
