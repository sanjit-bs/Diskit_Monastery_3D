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
     DOM
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

    /* HOTSPOTS (unchanged, FIXED scaling) */

    sceneData.linkHotspots.forEach(function (hotspot) {
      scene.hotspotContainer().createHotspot(
        createLinkHotspotElement(hotspot),
        { yaw: hotspot.yaw, pitch: hotspot.pitch }
      );
    });

    sceneData.infoHotspots.forEach(function (hotspot) {
      scene.hotspotContainer().createHotspot(
        createInfoHotspotElement(hotspot),
        { yaw: hotspot.yaw, pitch: hotspot.pitch }
      );
    });

    return { data: sceneData, scene: scene, view: view };
  });

  /* ===============================
     AUTOTOUR
  =============================== */

  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,   // ✅ FIXED (was 5)
    targetPitch: 0,
    targetFov: Math.PI / 2
  });

  var currentSceneIndex = 0;
  var lastYaw = 0;
  var accumulatedYaw = 0;
  var autoRunning = false;
  var userInteracting = false;
  var resumeTimer = null;

  function updateAutoTourStatus(state) {
    autoTourStatusBox.classList.remove('stopped', 'interacting');

    if (state === 'running') {
      autoTourStatusBox.textContent = 'Auto tour running';
    } else if (state === 'stopped') {
      autoTourStatusBox.textContent = 'Auto tour stopped';
      autoTourStatusBox.classList.add('stopped');
    } else if (state === 'interacting') {
      autoTourStatusBox.textContent = 'User interaction';
      autoTourStatusBox.classList.add('interacting');
    }
  }

  function startAutoTour() {
    if (autoRunning) return;

    var scene = scenes[currentSceneIndex];
    lastYaw = scene.view.parameters().yaw;
    accumulatedYaw = 0;

    viewer.startMovement(autorotate);
    viewer.setIdleMovement(2000, autorotate);

    autoRunning = true;
    updateAutoTourStatus('running');
    requestAnimationFrame(monitorRotation);
  }

  function stopAutoTour() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
    autoRunning = false;
    updateAutoTourStatus('stopped');
  }

  function monitorRotation() {
    if (!autoRunning || userInteracting) {
      requestAnimationFrame(monitorRotation);
      return;
    }

    var view = scenes[currentSceneIndex].view;
    var yaw = view.parameters().yaw;

    var delta = yaw - lastYaw;
    if (delta > Math.PI) delta -= 2 * Math.PI;
    if (delta < -Math.PI) delta += 2 * Math.PI;

    accumulatedYaw += Math.abs(delta);
    lastYaw = yaw;

    if (accumulatedYaw >= 2 * Math.PI) {
      goToNextScene();
      return;
    }

    requestAnimationFrame(monitorRotation);
  }

  function goToNextScene() {
    stopAutoTour();

    currentSceneIndex =
      (currentSceneIndex + 1) % scenes.length;

    var next = scenes[currentSceneIndex];
    next.view.setParameters(next.data.initialViewParameters);
    next.scene.switchTo();

    updateSceneName(next);
    updateSceneList(next);

    setTimeout(startAutoTour, 800);
  }

  /* ===============================
     USER INTERACTION
  =============================== */

  function onUserInteraction() {
    if (!autoRunning) return;

    userInteracting = true;
    updateAutoTourStatus('interacting');

    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () {
      userInteracting = false;
      startAutoTour();
    }, 1500);
  }

  panoElement.addEventListener('mousedown', onUserInteraction);
  panoElement.addEventListener('wheel', onUserInteraction);
  panoElement.addEventListener('touchstart', onUserInteraction);

  /* ===============================
     UI
  =============================== */

  autorotateToggleElement.addEventListener('click', function () {
    autorotateToggleElement.classList.toggle('enabled');
    autorotateToggleElement.classList.contains('enabled')
      ? startAutoTour()
      : stopAutoTour();
  });

  sceneListToggleElement.addEventListener('click', function () {
    sceneListElement.classList.toggle('enabled');
  });

  scenes.forEach(function (scene) {
    var el = document.querySelector(
      '#sceneList .scene[data-id="' + scene.data.id + '"]'
    );
    el.addEventListener('click', function () {
      stopAutoTour();
      currentSceneIndex = scenes.indexOf(scene);
      scene.scene.switchTo();
      updateSceneName(scene);
      updateSceneList(scene);
      startAutoTour();
    });
  });

  if (screenfull.enabled) {
    fullscreenToggleElement.addEventListener('click', function () {
      screenfull.toggle();
    });
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
     HOTSPOT HELPERS
  =============================== */

  function createLinkHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.className = 'link-hotspot';

    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.className = 'link-hotspot-icon';

    wrapper.appendChild(icon);
    wrapper.addEventListener('click', function () {
      stopAutoTour();
      var target = scenes.find(s => s.data.id === hotspot.target);
      currentSceneIndex = scenes.indexOf(target);
      target.scene.switchTo();
      startAutoTour();
    });

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {
    var wrapper = document.createElement('div');
    wrapper.className = 'info-hotspot';
    wrapper.innerHTML =
      '<strong>' + hotspot.title + '</strong><br>' + hotspot.text;
    return wrapper;
  }

  /* ===============================
     INIT
  =============================== */

  autorotateToggleElement.classList.add('enabled');
  scenes[0].scene.switchTo();
  updateSceneName(scenes[0]);
  updateSceneList(scenes[0]);
  startAutoTour();

})();
