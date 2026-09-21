// Compatibility exports for customer modules. Notification presentation now
// lives in the shared UI family used by every role.
export {
  HavenNotificationItem as CustomerNotificationRow,
  type HavenNotification as CustomerNotificationItem,
} from "@/components/ui/haven-notifications";
