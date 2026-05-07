export const eventDisplayPresets = [
  {
    id: "sample-event",
    eventName: "Sample Event",
    eventDescription: "This is a sample event display for testing the image-to-liveboard rotation.",
    liveboardDurationSeconds: 6,
    transitionSeconds: 0.5,
    images: [
      {
        id: "sample-image-1",
        name: "Sample Slide 1",
        imageUrl: "/display-slides/sample-1.svg",
        durationSeconds: 6,
      },
      {
        id: "sample-image-2",
        name: "Sample Slide 2",
        imageUrl: "/display-slides/sample-2.svg",
        durationSeconds: 6,
      },
    ],
  },
  {
    id: "second-sample-event",
    eventName: "Second Sample Event",
    eventDescription: "This is another saved event display preset for testing the selector.",
    liveboardDurationSeconds: 6,
    transitionSeconds: 0.5,
    images: [
      {
        id: "sample-image-3",
        name: "Second Event Slide",
        imageUrl: "/display-slides/sample-3.svg",
        durationSeconds: 6,
      },
    ],
  },
];
