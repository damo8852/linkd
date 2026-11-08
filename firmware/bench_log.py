# Bench log for the battery tests (issue #59). Pure logic, host-tested; bench.py does the I/O.
# One line per record in /bench.log on the board:
#   BOOT cause=<reset cause> unexpected=<0|1> last_up_s=<n>
#   START <mode>     a run began
#   UP <seconds>     heartbeat, uptime since START
#   STOP             the run was ended on purpose
# MicroPython reports a brown-out as PWRON_RESET, the same as plugging in power. On battery with
# nobody touching the board, any reset (other than a soft reset) while a run is in progress is
# therefore flagged unexpected: a brown-out, a crash, or the cell giving out.


def start_line(mode):
    return 'START ' + mode


def heartbeat_line(up_s):
    return 'UP ' + str(up_s)


def stop_line():
    return 'STOP'


def _parse(lines):
    """Yields ('START'|'UP'|'STOP'|'BOOT', value) for well-formed lines, skipping the rest."""
    for line in lines:
        parts = line.split()
        if not parts:
            continue
        kind = parts[0]
        if kind == 'START' and len(parts) == 2:
            yield kind, parts[1]
        elif kind == 'UP' and len(parts) == 2 and parts[1].isdigit():
            yield kind, int(parts[1])
        elif kind == 'STOP' and len(parts) == 1:
            yield kind, None
        elif kind == 'BOOT':
            yield kind, line


def boot_line(cause, prev_lines):
    in_run, last_up = False, 0
    for kind, value in _parse(prev_lines):
        if kind == 'START':
            in_run, last_up = True, 0
        elif kind == 'UP':
            last_up = value
        elif kind == 'STOP':
            in_run = False
    unexpected = 1 if in_run and cause != 'SOFT_RESET' else 0
    return 'BOOT cause=%s unexpected=%d last_up_s=%d' % (cause, unexpected, last_up)


def summarize(lines):
    runs = unexpected = longest = last_up = 0
    stopped = False
    for kind, value in _parse(lines):
        if kind == 'START':
            runs += 1
            last_up, stopped = 0, False
        elif kind == 'UP':
            last_up = value
            longest = max(longest, value)
        elif kind == 'STOP':
            stopped = True
        elif kind == 'BOOT' and 'unexpected=1' in value:
            unexpected += 1
    return {
        'runs': runs,
        'unexpected_resets': unexpected,
        'longest_up_s': longest,
        'last_up_s': last_up,
        'stopped_cleanly': stopped,
    }
