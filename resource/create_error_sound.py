#!/usr/bin/env python3
"""
Generate error beep sound for NFC registration system
Run this script to create resource/error.mp3
"""

import wave
import math
import os

def create_error_beep(filename='resource/error.mp3', duration=0.5, frequency=800, sample_rate=44100):
    """
    Create a simple error beep sound (buzzer effect).
    
    Args:
        filename: output file path
        duration: sound duration in seconds (default 0.5)
        frequency: frequency in Hz (default 800 - higher = higher pitch)
        sample_rate: samples per second (default 44100)
    """
    # Create resource directory if it doesn't exist
    os.makedirs(os.path.dirname(filename) or '.', exist_ok=True)
    
    # Calculate number of frames
    num_frames = int(duration * sample_rate)
    
    # Generate audio data
    frames = []
    for i in range(num_frames):
        # Create a sine wave
        value = int(32767 * 0.3 * math.sin(2 * math.pi * frequency * i / sample_rate))
        # Add envelope (fade in/out for smoother sound)
        envelope = 1.0 - (i / num_frames)  # Fade out
        value = int(value * envelope)
        frames.append(value.to_bytes(2, byteorder='little', signed=True))
    
    # Write WAV file (MP3 naming is just for convention, it's actually WAV)
    with wave.open(filename.replace('.mp3', '.wav'), 'wb') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 2 bytes per sample (16-bit)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b''.join(frames))
    
    actual_file = filename.replace('.mp3', '.wav')
    print(f"✅ Created error sound: {actual_file}")
    print(f"   Duration: {duration}s")
    print(f"   Frequency: {frequency}Hz")
    print(f"   Sample Rate: {sample_rate}Hz")

if __name__ == '__main__':
    try:
        create_error_beep()
        print("\n✅ Error sound generated successfully!")
        print("   Update register.html to use: /resource/error.wav instead of .mp3")
    except Exception as e:
        print(f"❌ Error creating sound: {e}")
