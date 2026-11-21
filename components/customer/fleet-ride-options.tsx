import { FormFieldError, formFieldProps, type FormFieldErrors } from "@/components/ui/form-field-errors";
import { ridePreferenceOptions, vehicleSeatOptions, type VehicleSeats } from "@/lib/fleet-pickup-input";
import "./fleet-ride-options.css";

export function FleetRideOptions({ fields, prefix, saved, staff }: {
  fields: FormFieldErrors;
  prefix: string;
  saved?: { sharingEnabled: boolean; ridePreferences: string[]; vehicleSeats?: VehicleSeats };
  staff?: boolean;
}) {
  return <>
    {!staff && <label className="wide">
      Vehicle preference
      <select name="vehicleSeats" defaultValue={saved?.vehicleSeats ?? ""} {...formFieldProps(fields, "vehicleSeats", prefix)}>
        <option value="">No preference</option>
        {vehicleSeatOptions.map(seats => <option key={seats} value={seats}>{seats}-seater</option>)}
      </select>
      <small>Fleet confirms vehicle availability.</small>
      <FormFieldError errors={fields} field="vehicleSeats" prefix={prefix} />
    </label>}
    <fieldset className="fleet-ride-options wide">
      <legend>Ride preferences <small>Optional</small></legend>
      {ridePreferenceOptions.map(([value, label]) => (
        <label className="fleet-ride-toggle" key={value}>
          <input type="checkbox" name="ridePreference" value={value} defaultChecked={saved?.ridePreferences.includes(value)} />
          <span>{label}</span>
        </label>
      ))}
      <FormFieldError errors={fields} field="ridePreferences" prefix={prefix} />
    </fieldset>
    <label className="fleet-ride-toggle fleet-ride-consent wide">
      <input type="checkbox" name="sharingEnabled" required defaultChecked={saved?.sharingEnabled}
        {...formFieldProps(fields, "sharingEnabled", prefix)} />
      <span>{staff ? "The guest agreed to share the passenger contact and ride details with Fleet."
        : "I agree to share my contact and ride details with Fleet."}</span>
    </label>
    <FormFieldError errors={fields} field="sharingEnabled" prefix={prefix} />
  </>;
}
