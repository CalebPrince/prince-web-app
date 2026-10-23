# Managing the VidKre8 screening room

The gallery is defined in `src/lib/vidkre8-videos.ts`. Put each publicly approved MP4 and JPEG poster in `public/vidkre8/videos/`, then add its title, category, source path, poster path, description and actual file duration to that catalog.

- Set `excerpt` to true for short samples and false for a complete film. The page labels them differently.
- Set `silent` according to whether the file has an audio track. Keep captions in the video or supply an appropriate caption track for spoken films.
- Use H.264 MP4 with fast-start metadata for reliable web playback. Keep poster dimensions and bitrate appropriate for the web.
- Confirm duration with `ffprobe`; do not use a full project's running time for an excerpt.
- Each sample plays directly inside its card, preserves its aspect ratio, loads media only when requested, and uses native controls for playback, volume and fullscreen.
- The LCA walkthrough is intentionally excluded at the owner's request.

Initial samples come from the owner's `video-studio` repository. Wedding and The Long Table are concept samples. The source reel excerpts are silent 2.2-second files; the complete LIID Flo and Website Showcase ads are web-sized copies of the showcase exports. Poster images come from the corresponding video files, rather than unrelated project photos.

The expanded set also includes the complete Think Of Fashion campaign, BuineePay commercial and Ayeko Solar brand film. Their public copies are web-sized H.264/AAC exports with fast-start metadata.

The software ads added on 23 Oct 2026 are complete films, web-sized (720 x 1280, H.264 at about 0.85 Mbit/s, AAC 128k, fast start) from the studio's mixed exports: Elon POS (business software, with the system's real figures and its launch offer), Inteli-Space (AI workspace), Qabenji (team and project tool) and English Adventure (children's learning game, coming soon). Their posters are frames from the films. Lisa learns about these ads from the VidKre8 Studio project's summary (`database/seed_real_projects.php`), so keep that list in step with this gallery.

Each sample has a branded custom cover composed from its own poster, title, category and running time. Change `poster` to use a different approved thumbnail image for any film. The cover clears on actual playback and the active film stays in its own card.
