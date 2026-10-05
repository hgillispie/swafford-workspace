#!/usr/bin/env python3
"""Sample face centers, falling back to motion centroids. Prints JSON."""

import json
import sys

import cv2


def main() -> None:
    path = sys.argv[1]
    cascade_path = (
        sys.argv[2]
        if len(sys.argv) > 2
        else cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    )
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise SystemExit(f"Could not open {path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    cascade = cv2.CascadeClassifier(cascade_path)
    step = max(1, int(round(fps / 2)))
    samples = []
    prev = None
    index = 0
    faces_found = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if index % step == 0 and width > 0:
            target_w = min(640, width)
            small = cv2.resize(
                frame,
                (target_w, max(1, int(height * target_w / width))),
            )
            gray = cv2.equalizeHist(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
            scale = width / small.shape[1]
            cx = width / 2
            cy = height / 2
            kind = "center"
            if not cascade.empty():
                faces = cascade.detectMultiScale(
                    gray, scaleFactor=1.1, minNeighbors=4, minSize=(36, 36)
                )
                if len(faces):
                    x, y, w, h = max(faces, key=lambda face: face[2] * face[3])
                    cx = (x + w / 2) * scale
                    cy = (y + h / 2) * scale
                    kind = "face"
                    faces_found += 1
            if kind != "face" and prev is not None:
                diff = cv2.absdiff(gray, prev)
                _, mask = cv2.threshold(diff, 24, 255, cv2.THRESH_BINARY)
                moments = cv2.moments(mask)
                if moments["m00"] > 800:
                    cx = (moments["m10"] / moments["m00"]) * scale
                    cy = (moments["m01"] / moments["m00"]) * scale
                    kind = "motion"
            prev = gray
            samples.append(
                {"t": round(index / fps, 3), "cx": cx, "cy": cy, "kind": kind}
            )
        index += 1
    cap.release()
    json.dump(
        {
            "width": width,
            "height": height,
            "facesFound": faces_found,
            "samples": samples,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
