/**
 * The Command Center (the sign-in for administrators and chairmen) can be left out of one deployment: build with VITE_COMMAND_CENTER=off
 * and the profile, its tile and its login page do not exist in that build. Used for the public website, so that it never contains a
 * password form (browsers' phishing checks treat a sign-in form on a public site as a risk); staff sign in at the other deployment.
 * With nothing set, the Command Center is included, exactly as before.
 */
export const COMMAND_CENTER_ENABLED = import.meta.env.VITE_COMMAND_CENTER !== 'off';
