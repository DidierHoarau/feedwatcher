import mitt from "mitt";
export const EventBus = mitt();

export enum EventTypes {
  AUTH_UPDATED = "AUTH_UPDATED",
  TASK_UPDATED = "TASK_UPDATED",
  ALERT_MESSAGE = "ALERT_MESSAGE",
  TASK_EXECUTION_TRIGGERED = "TASK_EXECUTION_TRIGGERED",
  TASK_EXECUTION_CLOSED = "TASK_EXECUTION_CLOSED",
}

export function handleError(error: any): void {
  let text = error.response;
  if (error.response && error.response.data && error.response.data.error) {
    text = error.response.data.error;
  }
  EventBus.emit(EventTypes.ALERT_MESSAGE, {
    type: "error",
    text,
  });
}
