/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function () {

  var Marzipano = window.Marzipano;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  /* ===============================
     DOM ELEMENTS
  =============================== */

  var panoElement = document.getElementById('pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.getElementById('sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.getElementById('sceneListToggle');
  var autorotateToggleElement = document.getElementById('autorotateToggle');
  var fullscreenToggleElement = document.getElementById('fullscreenToggle');
  var autoTourStatusBox = document.getElementById('autoTourStatus');

  /* ===============================
     VIEWER
  =============================== */

  var viewer = new Marzipano.Viewer(panoElement, {
    controls: { mouseViewMode: data.settings.mouseViewMode }
  });

  /* ===============================
     SCENES
  =============================== */

  var scenes = data.scenes.map(function (sceneData) {

    var source = Marzipano.ImageUrlSource.fromString(
      'tiles/' + sceneData.id + '/{z}/{f}/{y}/{x}.jpg',
      { cubeMapPreviewUrl: 'tiles/' + sceneData.id + '/preview.jpg' }
    );

    var geometry = new Marzipano.CubeGeometry(sceneData.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(
      sceneData.faceSize,
      100 * Math.PI / 180,
      120 * Math.PI / 180
    );

    var view = new Marzipano.RectilinearView(
      sceneData.initialViewParameters,
      limiter
    );

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    /* ---------- HOTSPOTS ---------- */

    sceneData.linkHotspots.forEach(function (hotspot) {
      addHotspotToScene(scene, createLinkHotspotElement(hotspot), hotspot.yaw, hotspot.pitch);
    });

    sceneData.infoHotspots.forEach(function (hotspot) {
      addHotspotToScene(scene, createInfoHotspotElement(hotspot), hotspot.yaw, hotspot.pitch);
    });

    return { data: sceneData, scene: scene, view: view };
  });

  /* ===============================
     AUTOTOUR CONFIG
  =============================== */

  var autorotate = Marzipano.autorotate({
    yawSpeed: 5,
    targetPitch: 0,
    targetFov: Math.PI / 2
  });

  var currentSceneIndex = 0;
  var lastYaw = 0;
  var rotationCounter = 0;
  var autoSwitchRunning = false;
  var userInteracting = false;
  var interactionTimeout = null;

  /* ===============================
     STATUS BOX
  =============================== */

  function updateAutoTourStatus(state) {
    autoTourStatusBox.classList.remove('stopped', 'interacting');

    if (state === 'running') {
      autoTourStatusBox.textContent = 'Auto tour is running';
    } else if (state === 'stopped') {
      autoTourStatusBox.textContent = 'Auto tour stopped';
      autoTourStatusBox.classList.add('stopped');
    } else if (state === 'interacting') {
      autoTourStatusBox.textContent = 'Auto tour is interacting';
      autoTourStatusBox.classList.add('interacting');
    }
  }

  /* ===============================
     AUTOROTATION CONTROL
  =============================== */

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) return;

    var scene = scenes[currentSceneIndex];
    lastYaw = scene.view.parameters().yaw;
    rotationCounter = 0;

    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);

    autoSwitchRunning = true;
    requestAnimationFrame(autoSwitchMonitor);

    updateAutoTourStatus('running');
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
    autoSwitchRunning = false;
    updateAutoTourStatus('stopped');
  }

  function autoSwitchMonitor() {
    if (!autoSwitchRunning || userInteracting) {
      requestAnimationFrame(autoSwitchMonitor);
      return;
    }

    var scene = scenes[currentSceneIndex];
    var yaw = scene.view.parameters().yaw;

    var deltaYaw = yaw - lastYaw;
    if (deltaYaw > Math.PI) deltaYaw -= 2 * Math.PI;
    if (deltaYaw < -Math.PI) deltaYaw += 2 * Math.PI;

    rotationCounter += Math.abs(deltaYaw);
    lastYaw = yaw;

    if (rotationCounter >= 2 * Math.PI) {
      currentSceneIndex = (currentSceneIndex + 1) % scenes.length;
      switchScene(scenes[currentSceneIndex], true);
      return;
    }

    requestAnimationFrame(autoSwitchMonitor);
  }

  autorotateToggleElement.addEventListener('click', function () {
    autorotateToggleElement.classList.toggle('enabled');
    autorotateToggleElement.classList.contains('enabled')
      ? startAutorotate()
      : stopAutorotate();
  });

  /* ===============================
     USER INTERACTION
  =============================== */

  function onUserInteraction() {
    if (!autoSwitchRunning) return;

    userInteracting = true;
    updateAutoTourStatus('interacting');

    clearTimeout(interactionTimeout);
    interactionTimeout = setTimeout(function () {
      userInteracting = false;
      updateAutoTourStatus('running');
    }, 1500);
  }

  panoElement.addEventListener('mousedown', onUserInteraction);
  panoElement.addEventListener('wheel', onUserInteraction);
  panoElement.addEventListener('touchstart', onUserInteraction);

  /* ===============================
     SCENE SWITCHING
  =============================== */

  function switchScene(sceneObj, fromAutoSwitch) {
    stopAutorotate();

    sceneObj.view.setParameters(sceneObj.data.initialViewParameters);
    sceneObj.scene.switchTo();

    currentSceneIndex = scenes.indexOf(sceneObj);
    lastYaw = sceneObj.view.parameters().yaw;
    rotationCounter = 0;

    updateSceneName(sceneObj);
    updateSceneList(sceneObj);

    if (!fromAutoSwitch) userInteracting = false;

    startAutorotate();
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = scene.data.name;
  }

  function updateSceneList(scene) {
    sceneElements.forEach(function (el) {
      el.classList.toggle(
        'current',
        el.getAttribute('data-id') === scene.data.id
      );
    });
  }

  /* ===============================
     HOTSPOT FUNCTIONS
  =============================== */

  function createLinkHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.className = 'hotspot link-hotspot';

    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    wrapper.appendChild(icon);

    wrapper.addEventListener('click', function () {
      userInteracting = false;
      stopAutorotate();
      switchScene(findSceneById(hotspot.target), false);
    });

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.className = 'hotspot info-hotspot';
    wrapper.innerHTML =
      '<strong>' + hotspot.title + '</strong><br>' + hotspot.text;
    return wrapper;
  }

  function addHotspotToScene(scene, element, yaw, pitch) {
    scene.hotspotContainer().createHotspot(
      element,
      { yaw: yaw, pitch: pitch },
      { perspective: false } // fixed-size on screen
    );
  }

  

  function findSceneById(id) {
    return scenes.find(function (s) {
      return s.data.id === id;
    });
  }

  /* ===============================
     UI
  =============================== */

  sceneListToggleElement.addEventListener('click', function () {
    sceneListElement.classList.toggle('enabled');
  });

  scenes.forEach(function (scene) {
    var el = document.querySelector(
      '#sceneList .scene[data-id="' + scene.data.id + '"]'
    );
    el.addEventListener('click', function () {
      switchScene(scene, false);
    });
  });

  if (screenfull.enabled) {
    fullscreenToggleElement.addEventListener('click', function () {
      screenfull.toggle();
    });
  }

  /* ===============================
     INIT
  =============================== */

  autorotateToggleElement.classList.add('enabled');
  updateAutoTourStatus('running');
  switchScene(scenes[0], false);

})();
