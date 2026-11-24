# Funde Autopilot: one-time setup (about 60 to 90 minutes, once)

What it does after setup, with nobody touching it:
- Publishes each queued reel or carousel to Instagram and the Facebook Page at the exact IST time you picked.
- Refuses Sunday times, and never publishes on a Sunday.
- Refuses captions with more than 5 hashtags, and warns past 470 characters (Threads cross-share).
- Every morning at 6:00 IST it saves the numbers: YouTube views, likes, comments and subscribers per video; Instagram likes, comments, reach, views, sends (shares) and saves per post, plus followers; Facebook Page followers.
- A phone-friendly page (the Worker's own address) to upload, schedule, cancel, retry and see the numbers.

What it does NOT do (and why):
- YouTube uploads. Google locks videos uploaded through an unaudited API project to private. Keep using YouTube Studio's own Schedule button (about 5 minutes a video). If you later want this automated, Google's API audit form is the route; I have not checked how long it takes.
- Threads. Turn on "Share to Threads" in the Instagram app once; check whether it applies to API posts on your account after the first test post.
- The FUNDA comment-to-DM reply. Use Instagram's own automation or a Meta-approved tool (see the Automation Map page). Building it here would need Meta's advanced-access review.

---

## Part A. Cloudflare (where the robot lives). You already use Cloudflare for the tools site.

1. On a computer, install Node.js (nodejs.org, the LTS button).
2. Open a terminal in this `autopilot` folder.
3. Type `npm install` and press Enter.
4. Type `npx wrangler login`. A browser opens. Log in to the same Cloudflare account as the tools site. Click Allow.
5. Type `npx wrangler d1 create funde-autopilot`. It prints a `database_id`. Copy it into `wrangler.toml` in place of `PASTE_D1_DATABASE_ID_HERE`.
6. Type `npm run db:init` (creates the two tables).
7. Type `npx wrangler r2 bucket create funde-media`.
8. In the Cloudflare dashboard: R2 > funde-media > Settings > Public Development URL > Enable. Copy the `https://pub-....r2.dev` address into `wrangler.toml` as `MEDIA_PUBLIC_BASE` (no slash at the end). Instagram and Facebook download your files from this address, so it must be public. Do not put anything private in this bucket.
9. Type `npx wrangler secret put ADMIN_KEY` and type a long password you will remember. This protects the scheduler page.

## Part B. Instagram and Facebook (the permission key)

Needs: Instagram @fundekafundaofficial set as a Professional (Business or Creator) account, linked to the Funde Ka Funda Facebook Page. In the Instagram app: Profile > menu > Account type and tools. Linking: Facebook Page > Settings > Linked accounts > Instagram.

1. Go to developers.facebook.com, log in with the Facebook account that is admin of the Page. My Apps > Create App > choose the use case for managing Instagram and Pages content (Business type).
2. Add the products "Instagram" (API with Facebook login) and "Facebook Login for Business".
3. Open Tools > Graph API Explorer. Pick your app. Click "Get User Access Token" and tick: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `instagram_manage_insights`, `business_management`. Click Generate and allow.
4. Make it long-lived: Tools > Access Token Debugger > paste the token > "Extend Access Token". Copy the new one.
5. In the Explorer, with that long-lived token, run `me/accounts`. Find the Funde Ka Funda Page. Copy its `id` (that is `FB_PAGE_ID`) and its `access_token` (the Page token; made from a long-lived user token it does not expire unless you change your password or remove the app).
6. Run `<FB_PAGE_ID>?fields=instagram_business_account`. The `id` inside is `IG_USER_ID`.
7. Put both IDs into `wrangler.toml`. Then type `npx wrangler secret put META_TOKEN` and paste the Page token.

Note: the app can stay in Development mode because only your own accounts use it. If Meta asks for App Review for any permission on your account, tell me the exact message and I will help with it.

## Part C. YouTube numbers (read-only, free)

1. Go to console.cloud.google.com with any Google account (it does not need to be the channel's).
2. Create a project > APIs and services > Library > "YouTube Data API v3" > Enable.
3. Credentials > Create credentials > API key. Click "Restrict key" > API restrictions > YouTube Data API v3 > Save.
4. Type `npx wrangler secret put YT_API_KEY` and paste the key.
5. Check `YT_HANDLE` in `wrangler.toml` matches the channel handle exactly (with @).

## Part D. Switch it on

1. Type `npm run deploy`. It prints the address, like `https://funde-autopilot.<name>.workers.dev`.
2. Open that address on your phone. Enter the admin key. Tap "Save key on this phone".
3. Tap "Pull numbers now". You should see YouTube, Instagram and Facebook lines without "error". If one shows an error, send me the exact words.
4. First test: schedule a throwaway carousel 20 minutes ahead (2 JPG images, caption "test"). After it posts, delete it in the Instagram app. Within 15 minutes of the time it should go live (the robot checks every 15 minutes; reels take one or two extra checks while Instagram processes the video).

## Every week after that (about 10 minutes, Monday to Saturday)
1. Open the scheduler page.
2. For each reel or carousel in the week's package: Type, time (from the package's schedule), tick Instagram and Facebook, pick files in slide order, paste caption, "Upload and schedule".
3. Upload the YouTube long video and the Short in YouTube Studio and press Schedule (thumbnail, SRT, end screen: the package page has tap-by-tap steps).
4. Reel cover image: the API cannot set a custom cover from a separate image file on every account; if the cover matters, check it after it goes live and change it in the app if needed.

## Files
- `src/index.js`: the robot (scheduling, publishing, numbers).
- `src/admin.js`: the phone page.
- `migrations/0001_init.sql`: database tables.
- `test/`: checks for the Sunday rule, hashtag cap and time conversion (`npm test`).

Things I could not test from my side: the real Instagram, Facebook and YouTube servers (my workspace cannot reach them). The full publish flow was tested against a stand-in that answers the way Meta's documented API does. Do the test post in Part D step 4 before trusting it with a real launch.
