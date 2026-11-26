# Face and hand camera cutouts — example 11

- Implementation reference: [MediaPipe Face Detector, official web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector/web_js).
- API: [FaceDetector JavaScript reference](https://developers.google.com/edge/api/mediapipe/js/tasks-vision.facedetector).
- Model: [Google-hosted BlazeFace Short-Range, float16, version 1](https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite).
- Saved to `src/assets/blaze-face-short-range.tflite`; 229,746 bytes. SHA-256: `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f`.
- Uses the project's existing `@mediapipe/tasks-vision` and `/mediapipe/` WASM files. The face Worker and model are isolated inside example 11; shared hand tracking and other examples are unchanged.

A low-resolution (maximum 320px wide) frame is sent to a classic Worker at most 8 times per second. Only one face inference can be pending. The worker returns the largest confident face box, closes each transferred bitmap, and never stores or uploads camera images. The video is shown through a bounded, feathered face oval; the rest is transparent. This is a face-box crop, not per-pixel background segmentation. If the model/Worker/CSS mask is unavailable, no unmasked video is displayed.

Closing the show terminates the worker. Visibility/orientation changes discard old masks and pending epoch results. The original video remains available to the existing hand detector, so the face crop does not restrict hand inference.

The actual model/WASM/compiled worker were checked offline against the existing Christine face sprite and an empty gray frame: a face was returned only for the sprite. No server, webcam recording or external inference service was used.

## Glass-hall window and puppeteer hands

The face layer is clipped to the symmetrical arched glass-hall opening, underneath mullions and glass tint. Two additional small canvases (`hand-tools.ts`) sample the **same original video** only within the tracked palm/fingertip ovals, with 28% opacity and a destination-in feather mask. Their backing sizes are capped at 768 logical pixels per dimension and device scale is capped at 1.25. These cutouts sit in front of the theatre valance so the wooden cross and decorated conductor wand remain visible. The rest of the room is cleared, not blurred into view. No additional camera permission, video stream, hand model, image upload or storage is used.

The hand masks reverse the existing mirrored screen mapping once; camera pixels and prop geometry therefore stay aligned in portrait and landscape. Their frame key includes video time, both landmark timestamps and viewport size. Missing hands hide independently, help/visibility changes clear both patches, and show teardown hides and clears them before the end card. Face-model unavailability does not disable these hand patches or the existing hand controls.
