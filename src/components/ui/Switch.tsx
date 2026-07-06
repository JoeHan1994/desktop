'use client';

import { useId } from 'react';
import styled from 'styled-components';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  ariaLabel?: string;
}

export function Switch({ checked, onChange, disabled = false, id, ariaLabel }: SwitchProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <StyledWrapper data-disabled={disabled || undefined}>
      <label className="switch-button" htmlFor={inputId}>
        <div className="switch-outer">
          <input
            id={inputId}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            aria-label={ariaLabel}
            onChange={(event) => onChange(event.target.checked)}
          />
          <div className="button">
            <span className="button-toggle" />
            <span className="button-indicator" />
          </div>
        </div>
      </label>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  font-size: inherit;
  line-height: 1;

  .switch-button {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 1.6em;
  }

  .switch-button .switch-outer {
    height: 100%;
    background: #252532;
    width: 3.35em;
    border-radius: 999px;
    box-shadow:
      inset 0 0.16em 0.32em 0 #16151c,
      0 0.1em 0.2em -0.06em #403f4e;
    border: 1px solid #32303e;
    padding: 0.16em;
    box-sizing: border-box;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .switch-button .switch-outer input[type='checkbox'] {
    opacity: 0;
    appearance: none;
    position: absolute;
  }

  .switch-button .switch-outer .button-toggle {
    height: 1.28em;
    width: 1.28em;
    background: linear-gradient(#ffffff, #f1f5f9);
    border-radius: 100%;
    box-shadow:
      inset 0 0.08em 0.12em 0 rgb(255 255 255 / 0.9),
      0 0.13em 0.46em 0 rgb(0 0 0 / 0.36);
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    z-index: 2;
    transition: left 0.3s ease-in;
    left: 0;
  }

  .switch-button .switch-outer input[type='checkbox']:checked + .button .button-toggle {
    left: calc(100% - 1.28em);
  }

  .switch-button .switch-outer input[type='checkbox']:checked + .button .button-indicator {
    animation: indicator 1s forwards;
  }

  .switch-button .switch-outer .button {
    width: 100%;
    height: 100%;
    display: flex;
    position: relative;
    justify-content: space-between;
  }

  .switch-button .switch-outer .button-indicator {
    height: 0.72em;
    width: 0.72em;
    top: 50%;
    transform: translateY(-50%);
    border-radius: 50%;
    border: 0.12em solid #ef565f;
    box-sizing: border-box;
    right: 0.32em;
    position: absolute;
  }

  .switch-button .switch-outer input[type='checkbox']:focus-visible + .button {
    outline: 2px solid rgb(var(--accent-rgb));
    outline-offset: 5px;
    border-radius: 999px;
  }

  &[data-disabled] {
    opacity: 0.45;
  }

  &[data-disabled] .switch-button,
  &[data-disabled] .switch-outer {
    cursor: not-allowed;
  }

  @keyframes indicator {
    30% {
      opacity: 0;
    }

    0% {
      opacity: 1;
    }

    100% {
      opacity: 1;
      border: 0.12em solid #60d480;
      right: calc(100% - 1.04em);
    }
  }
`;

export default Switch;