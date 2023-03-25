import mitt from "mitt";
export const EventBus = mitt();

export enum EventTypes {
  ITEMS_UPDATED = "ITEMS_UPDATED",
  SOURCES_UPDATED = "SOURCES_UPDATED",
  AUTH_UPDATED = "AUTH_UPDATED",
  ALERT_MESSAGE = "ALERT_MESSAGE",
  FOLDERS_UPDATED = "FOLDERS_UPDATED",
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
