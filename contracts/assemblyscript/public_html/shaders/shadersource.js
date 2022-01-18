const source = `precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float targetNoteStates[128];

vec3 hsv2rgb(vec3 c)
{
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main(){
  #define product(a, b) vec2(a.x*b.x-a.y*b.y, a.x*b.y+a.y*b.x)
  #define PI 3.1415926538
  float songlengthsecs = ((260.0/122.0)*60.0);
  float speed = (PI * -2.0) / songlengthsecs;
  float t = 2.5 * sin(PI * 3.0/2.0 + time * speed) + 3.2;
  //t = 1.0;
  float res = resolution.x > resolution.y ? resolution.x : resolution.y;
  float scale = (6.0/pow(t,1.0 + t));
  vec2 center = vec2(0.950005,-0.251205);
  vec2 p = (gl_FragCoord.xy - resolution * 0.5) / res * scale;
  
  vec2 z;
  vec2 dc = p - center;
  float radius = sqrt(p.x*p.x+p.y*p.y) / scale;
  
  float rotationtime = (time / songlengthsecs) * floor(songlengthsecs / (PI * 2.0)) * PI * 2.0;
  float rotation = PI + rotationtime * 0.5 - sin(rotationtime) * (6.0-t) * radius;
  vec2 c = vec2(p.x*cos(rotation)-p.y*sin(rotation),p.x*sin(rotation)+p.y*cos(rotation)) - center;

  float color = 0.0;
  float max_iteration_float = exp(1.0 * sin(PI * 3.0/2.0) + t) * 20.0;
  
  for (int iteration = 0;iteration < 1000;iteration++) {
    z = product(z,z) + c;
    
    color += 1.0;
    if (color >= max_iteration_float) {
      break;
    }
    if (z.x*z.x + z.y*z.y > 4.0) {
      break;
    }
  }
  p.xy = z;

  color = (color  / max_iteration_float);

  float noteState = 0.0;
  for (int noteStateIndex = 0;noteStateIndex < 128; noteStateIndex++) {
  	float ndx = 127.0 * 2.0 * atan(p.y/p.x) / PI;
  	
    float dist = 1.0 / (1.0 + abs(float(noteStateIndex) - ndx));
    noteState += dist * (targetNoteStates[noteStateIndex] + 1.0);
  }
  noteState /= 4.0;
  float v = (0.5 * sin(radius * noteState * PI * sin(time * 0.5) * PI * 5.0)) + 0.5;
  
  vec3 rgb = hsv2rgb(vec3(1.0 - color * 1.0,v, 1.0 - color * 1.0 ));	  
  gl_FragColor=vec4(rgb,1);
}`;

const vertexShaderSrc = `            
attribute vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0, 1);
}
`;


export function setupWebGL(customGetTimeSeconds, getTargetNoteStates) {
    const canvas = document.querySelector('canvas');
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const glContext = canvas.getContext('webgl');
    
    glContext.viewport(0, 0, glContext.drawingBufferWidth, glContext.drawingBufferHeight);
    glContext.clearColor(0.0, 0.0, 0.0, 1.0);
    glContext.clear(glContext.COLOR_BUFFER_BIT);

    const vertexShader = glContext.createShader(glContext.VERTEX_SHADER);
    glContext.shaderSource(vertexShader, vertexShaderSrc);
    glContext.compileShader(vertexShader);

    const fragmentShader = glContext.createShader(glContext.FRAGMENT_SHADER);
    glContext.shaderSource(fragmentShader, source);
    glContext.compileShader(fragmentShader);

    const compiled = glContext.getShaderParameter(fragmentShader, glContext.COMPILE_STATUS);
    console.log('Shader compiled successfully: ' + compiled);
    if (!compiled) {
        const compilationLog = glContext.getShaderInfoLog(fragmentShader);
        throw new Error(compilationLog);
    }
    const program = glContext.createProgram();
    glContext.attachShader(program, vertexShader);
    glContext.attachShader(program, fragmentShader);
    glContext.linkProgram(program);
    glContext.detachShader(program, vertexShader);
    glContext.detachShader(program, fragmentShader);
    glContext.deleteShader(vertexShader);
    glContext.deleteShader(fragmentShader);
    if (!glContext.getProgramParameter(program, glContext.LINK_STATUS)) {
        const linkErrLog = glContext.getProgramInfoLog(program);
        throw new Error(linkErrLog);
    }

    glContext.enableVertexAttribArray(0);
    const buffer = glContext.createBuffer();
    glContext.bindBuffer(glContext.ARRAY_BUFFER, buffer);
    glContext.bufferData(
        glContext.ARRAY_BUFFER,
        new Float32Array([
            -1.0, -1.0,
            1.0, -1.0,
            -1.0, 1.0,
            -1.0, 1.0,
            1.0, -1.0,
            1.0, 1.0]),
        glContext.STATIC_DRAW
    );

    glContext.useProgram(program);

    const resolutionUniformLocation = glContext.getUniformLocation(program, "resolution");
    glContext.uniform2f(resolutionUniformLocation, glContext.canvas.width, glContext.canvas.height);
    const timeUniformLocation = glContext.getUniformLocation(program, "time");
    glContext.uniform1f(timeUniformLocation, 0.0);
    const targetNoteStatesUniformLocation = glContext.getUniformLocation(program, "targetNoteStates");
    glContext.uniform1fv(targetNoteStatesUniformLocation, getTargetNoteStates());

    const positionLocation = glContext.getAttribLocation(program, "a_position");
    glContext.enableVertexAttribArray(positionLocation);
    glContext.vertexAttribPointer(positionLocation, 2, glContext.FLOAT, false, 0, 0);

    glContext.drawArrays(glContext.TRIANGLES, 0, 6);

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;

    const render = () => {
        glContext.uniform1f(timeUniformLocation, customGetTimeSeconds ? customGetTimeSeconds() : getCurrentTimeSeconds());
        glContext.uniform1fv(targetNoteStatesUniformLocation, getTargetNoteStates());
        glContext.drawArrays(glContext.TRIANGLES, 0, 6);
        window.requestAnimationFrame(render);
    }

    render();
}
