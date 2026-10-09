/**
 * What a desktop dialog needs from a hosted group form (ABA-646): a way to submit it from the
 * dialog's own footer, and the little state that footer's button renders from. The phone passes
 * none of this and keeps the in-scroll buttons.
 */
export interface GroupFormHandle {
  /** Runs the same save the in-form button runs; resolves after the store write. */
  submit(): Promise<void>;
  /** Edit mode only: starts the same confirm-then-delete the in-form danger button starts. */
  remove?(): void;
}

export interface GroupFormState {
  canSubmit: boolean;
  submitting: boolean;
  isEditing: boolean;
}
