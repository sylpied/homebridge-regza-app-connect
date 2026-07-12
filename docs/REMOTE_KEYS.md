# REGZA remote-key reference

English | [日本語](REMOTE_KEYS.ja.md)

This table transcribes a community-provided REGZA remote-code reference. Behavior may vary by model and firmware. **Only entries in the verified section have been tested with this plugin.** Use unverified recording and disc commands carefully.

## Verified on 55J10X

| Action | Code |
|---|---|
| Mute | `40BF10` |
| Power toggle | `40BF12` |
| Volume up/down | `40BF1A` / `40BF1E` |
| Channel up/down | `40BF1B` / `40BF1F` |
| Display information | `40BF1C` |
| HDMI Next Active | `40BF3A` |
| Back/Enter | `40BF3B` / `40BF3D` |
| Up/Down/Left/Right | `40BF3E` / `40BF3F` / `40BF5F` / `40BF5B` |
| Program guide | `40BF6E` |
| Terrestrial/BS/CS | `40BF7A` / `40BF7C` / `40BF7D` |
| Discrete Power ON/OFF | `40BF7E` / `40BF7F` |
| Settings menu | `40BFD0` |

## Unverified reference codes

| Action | Code | Action | Code |
|---|---|---|---|
| Digits 1–12 | `40BF01`–`40BF0C` | Input switch | `40BF0F` |
| Audio mode | `40BF13` | Broadband | `40BF25` |
| Quick menu | `40BF27` | Multi screen | `40BF29` |
| Picture size | `40BF2B` | HDMI 1/2/3 | `40BF37` / `40BF38` / `40BF39` |
| Exit | `40BF3C` | Still/pause | `40BF50` |
| Channel number/search | `40BF60` | Radio/data | `40BF6D` |
| Cloud menu | `40BF6F` | Program information | `40BF71` |
| Blue/red/green/yellow | `40BF73` / `40BF74` / `40BF75` / `40BF76` | Mini guide | `40BF77` |
| Analog terrestrial | `40BF7B` | Record | `40BF86` |
| Skip forward/back | `40BE26` / `40BE27` | Recording list | `40BE28` |
| News now | `40BE29` | Stop | `40BE2B` |
| Rewind/play/fast-forward | `40BE2C` / `40BE2D` / `40BE2E` | REGZA menu | `40BE34` |
| Timeshift | `40BE35` | Program search | `40BE36` |
| 3D | `40BE43` | Jump to start | `40BE47` |
| Eject | `40BE93` | Disc | `40BE9E` |
| Subtitles | `43BC52` | Data broadcast | `43BC14` |

The source table also lists `40BE20`, `40BE21`, 30-second skip `40BE22`, and 10-second rewind `40BE23`. Please report tested codes with the exact TV model in a GitHub Issue.
