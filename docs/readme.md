# Online graphics.h Compiler

Run graphics.h Programs Online using Turbo C Wrapper

**Live Demo / Online Compiler:** [https://graphics-h-compiler.vercel.app/](https://graphics-h-compiler.vercel.app/)

<p align="center">
  <img src="demo.png" alt="Online graphics.h Compiler Turbo C Wrapper" width="800">
</p>

## Overview

Online graphics.h Compiler is a browser-based Turbo C wrapper that allows you to run graphics.h C++ programs without installing Turbo C, DOSBox, or any legacy tools.

The goal of this project is to simplify the learning experience for students by removing setup complexity and providing instant access to a working graphics.h environment.

### Source

Turbo C environment used in this project: [https://turbo-c.net/turbo-c-download/](https://turbo-c.net/turbo-c-download/)

## Architecture

- Turbo C UI wrapper
- Fully client-side execution
- Browser-based DOS emulation
- No server-side compilation

Performance depends on the client system's hardware and browser.

## Why This Project Exists

graphics.h is a legacy graphics library from the MS-DOS era. Setting it up today requires outdated tools, manual configuration, and troubleshooting that often frustrates students.

Despite this, graphics.h is still part of the SPPU Computer Graphics syllabus, including the 2024 revised curriculum. Many colleges continue to teach graphics concepts using obsolete environments.

This project removes installation barriers and allows students to focus on learning graphics programming rather than struggling with setup.

## Online and Offline Usage

The compiler can be used:

- Online via the hosted website
- Locally on your machine
- With or without internet access after loading

## Run Locally

```bash
git clone https://github.com/AlbatrossC/graphics-h-compiler.git
cd graphics.h-online-compiler
python -m http.server 8000
```

Open in your browser: [http://localhost:8000](http://localhost:8000)

## Intended Audience

This project is intended for:

- SPPU Computer Graphics students
- Beginners learning graphics.h
- Anyone looking for a simple online alternative to Turbo C

Built by an SPPU student to simplify the Computer Graphics learning experience.

---

© 2025 Online Graphics Wrapper  
Created to support and simplify learning graphics.h in modern environments.