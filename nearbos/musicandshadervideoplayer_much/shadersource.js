export default `precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float targetNoteStates[128];

float wave(float x, float freq, float speed, float amp) {
    return amp * sin(x * freq + time * speed);
}

void main() {
    vec2 uv = (gl_FragCoord.xy / resolution.xy) * 2.0 - 1.0; // UV coordinates [-1, 1]
    float x_index = (uv.x + 1.0) * 64.0; // Compute the corresponding index in targetNoteStates based on the x position

    float amp_lower = 0.0;
    float amp_upper = 0.0;
    int index_lower = 0;
    int index_upper = 0;

    for (int i = 0; i < 128; ++i) {
        if (float(i) <= x_index) {
            amp_lower = targetNoteStates[i];
            index_lower = i;
        }
        if (float(i) >= x_index && index_upper == 0) {
            amp_upper = targetNoteStates[i];
            index_upper = i;
        }
    }

    float fraction = (x_index - float(index_lower)) / (float(index_upper - index_lower) + 0.0001);

    float amp = mix(amp_lower, amp_upper, fraction); // interpolate amplitude
    float freq = float(index_lower) / 64.0; // Normalize index to [0, 2] for frequency

    float y = wave(uv.x, freq, 5.0, amp) * 0.2; // Add the note's wave to the total wave height, increased amplification factor

    float dayNight = sin(time * 0.2); // changes from -1 to 1 over time, can adjust speed with the 0.2 constant
    dayNight = dayNight * 0.5 + 0.5; // changes from 0 to 1

    vec3 dayColor = vec3(0.9, 0.9, 1.0);
    vec3 nightColor = vec3(0.1, 0.1, 0.3);
    vec3 sunsetColor = vec3(0.9, 0.4, 0.1);

    // calculate color based on time
    vec3 color;
    if (dayNight < 0.25) { // Night
        color = mix(nightColor, sunsetColor, dayNight / 0.25);
    } else if (dayNight < 0.75) { // Day
        color = mix(sunsetColor, dayColor, (dayNight - 0.25) / 0.5);
    } else { // Transition to night
        color = mix(dayColor, nightColor, (dayNight - 0.75) / 0.25);
    }

    // mix in the y component of the uv for the sea color
    color *= (uv.y + y + 0.5);

    // darken below the horizon
    if(uv.y + y < -0.1) {
        color *= 0.7;
    }

    gl_FragColor = vec4(color, 1.0);
}`;
