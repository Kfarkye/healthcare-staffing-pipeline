export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;
let toastCallback: ((message: string, type: ToastType) => void) | null = null;

export const registerToastHandler = (callback: (message: string, type: ToastType) => void) => {
  toastCallback = callback;
};

export const showToast = (message: string, type: ToastType = 'info') => {
  if (toastCallback) {
    toastCallback(message, type);
  } else {
    console.log(`[Toast ${type}]:`, message);
  }
};

export const generateToastId = () => {
  return ++toastId;
};
