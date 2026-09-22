# BloodBank frontend

Static GitHub Pages frontend for the BloodBank Cloud Run API.

## Files
- `index.html` — app shell and Google Identity Services loader
- `style.css` — responsive interface
- `app.js` — Google sign-in, bearer-token API requests, data views and forms

## Configure
At the top of `app.js`, verify:
- `API_BASE` is your deployed Cloud Run service URL
- `GOOGLE_CLIENT_ID` is your Google OAuth **Web application** client ID
- `ALLOWED_DOMAIN` is `mitwpu.edu.in`

## Important Cloud Run access note
GitHub Pages is a browser-only static host. If Cloud Run remains private, browsers cannot invoke it merely by sending a Google ID token; Cloud Run IAM blocks the request before Flask sees it. Do not enable public invocation until you have confirmed every API route is protected by backend token verification. Public invocation and public data access are different: the former allows reaching the service, while Flask should still reject requests without a valid ID token.

The frontend sends `Authorization: Bearer <Google ID token>`. Configure the OAuth consent screen/client authorized JavaScript origin to:
`https://damanchakraborty.github.io`
(and use the repository Pages URL as appropriate for your setup).

## Publish
Upload `index.html`, `style.css`, `app.js`, and `README.md` to the root of the `bloodbank-frontend` repository. In GitHub, open **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.

## API contract assumptions
This frontend calls:
- `GET /dashboard`, `/donors`, `/blood-units`, `/inventory`, `/thresholds`, `/alerts`
- `POST /donors`, `POST /blood-units`
- `PATCH /blood-units/<id>/status`
- `PUT /thresholds`
- `PATCH /alerts/<id>/acknowledge`

If your Flask routes use different field names or response wrappers, adjust the normalization/rendering in `app.js` to match your backend.
