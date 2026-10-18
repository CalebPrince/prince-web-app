# Managing the VidKre8 screening room

The gallery is defined in `src/lib/vidkre8-videos.ts`. Put each publicly approved MP4 and JPEG poster in `public/vidkre8/videos/`, then add its title, category, source path, poster path, description and actual file duration to that catalog.

- Set `excerpt` to true for short samples and false for a complete film. The page labels them differently.
- Set `silent` according to whether the file has an audio track. Keep captions in the video or supply an appropriate caption track for spoken films.
- Use H.264 MP4 with fast-start metadata for reliable web playback. Keep poster dimensions and bitrate appropriate for the web.
- Confirm duration with `ffprobe`; do not use a full project's running time for an excerpt.
- The player preserves aspect ratio, loads media only when requested, and uses native controls for playback, volume and fullscreen.
- The LCA walkthrough is intentionally excluded at the owner's request.

Initial samples come from the owner's `video-studio` repository. Wedding and The Long Table are concept samples. The source reel excerpts are silent 2.2-second files; the complete LIID Flo and Website Showcase ads are web-sized copies of the showcase exports. Poster images come from the corresponding video files, rather than unrelated project photos.

Each sample has a branded custom cover composed from its own poster, title, category and running time. Change `poster` to use a different approved thumbnail image for any film; the gallery and pre-play cinema cover use the same treatment. The cover clears on actual playback, not merely when a video is selected.
