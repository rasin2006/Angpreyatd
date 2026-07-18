# Error Sound Setup

The duplicate card error display expects an error sound file at:
```
c:\Users\rasin\Desktop\NFC\resource\error.mp3
```

## Option 1: Using Python to Generate a Simple Error Beep (Recommended)

Run this Python script to create an error sound:

```python
# save as: create_error_sound.py
import wave
import math
import os

def create_error_beep(filename, duration=0.5, frequency=800, sample_rate=44100):
    """
    Create a simple error beep sound (buzzer effect).
    
    Args:
        filename: output file path
        duration: sound duration in seconds
        frequency: frequency in Hz (higher = higher pitch)
        sample_rate: samples per second
    """
    # Calculate number of frames
    num_frames = int(duration * sample_rate)
    
    # Generate audio data
    frames = []
    for i in range(num_frames):
        # Create a sine wave
        value = int(32767 * 0.3 * math.sin(2 * math.pi * frequency * i / sample_rate))
        # Add envelope (fade in/out)
        envelope = 1.0 - (i / num_frames)  # Fade out
        value = int(value * envelope)
        frames.append(value.to_bytes(2, byteorder='little', signed=True))
    
    # Write WAV file
    with wave.open(filename, 'wb') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 2 bytes per sample
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b''.join(frames))
    
    print(f"✅ Created error sound: {filename}")

# Create the error sound
create_error_beep('resource/error.mp3')
```

Then run:
```bash
cd c:\Users\rasin\Desktop\NFC
python create_error_sound.py
```

## Option 2: Download Error Sound Online

Search for "error beep sound mp3" on a royalty-free sound site like:
- Freesound.org
- Pixabay
- Zapsplat
- OpenGameArt.org

Download and save as: `resource/error.mp3`

## Option 3: Use FFmpeg to Create Error Sound

If you have FFmpeg installed:

```bash
ffmpeg -f lavfi -i sine=f=800:d=0.5 -b:a 32k resource/error.mp3
```

## Testing

Once the error sound is in place, test it by:

1. Register a new student with a card
2. Try to register a different student with the SAME card
3. You should hear an error beep and see a red error message on the page

---

**File Location**: `c:\Users\rasin\Desktop\NFC\resource\error.mp3`

**Supported Formats**: MP3, WAV, OGG, FLAC
