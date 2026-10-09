import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import AVFoundation

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "TurboDownloader",
      in: window,
      launchOptions: launchOptions
    )

    disableFileProtectionForDownloads()
    BackgroundDownloadKeeper.shared.startKeepAlive()

    return true
  }

  func applicationDidEnterBackground(_ application: UIApplication) {
    disableFileProtectionForDownloads()
    BackgroundDownloadKeeper.shared.handleDidEnterBackground()
  }

  func applicationDidBecomeActive(_ application: UIApplication) {
    BackgroundDownloadKeeper.shared.handleDidBecomeActive()
  }

  private func disableFileProtectionForDownloads() {
    guard let docDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    let tdDir = docDir.appendingPathComponent("TurboDownloader")
    try? FileManager.default.createDirectory(at: tdDir, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.none])
    try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.none], ofItemAtPath: tdDir.path)
  }
}

class BackgroundDownloadKeeper: NSObject, AVAudioPlayerDelegate {
  static let shared = BackgroundDownloadKeeper()
  private var audioPlayer: AVAudioPlayer?
  private var bgTask: UIBackgroundTaskIdentifier = .invalid
  private var heartbeatTimer: DispatchSourceTimer?
  private var isRunning = false

  func startKeepAlive() {
    setupAudioSessionAndPlayer()
    setupNotifications()
    startHeartbeat()
  }

  private func setupNotifications() {
    NotificationCenter.default.removeObserver(self)
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAudioInterruption(_:)),
      name: AVAudioSession.interruptionNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleAudioRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification,
      object: nil
    )
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleMediaServicesReset(_:)),
      name: AVAudioSession.mediaServicesWereResetNotification,
      object: nil
    )
  }

  func setupAudioSessionAndPlayer() {
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true)

      let soundURL = getOrCreateSilenceURL()
      audioPlayer = try AVAudioPlayer(contentsOf: soundURL)
      audioPlayer?.delegate = self
      audioPlayer?.numberOfLoops = -1 // Continuous infinite loop
      audioPlayer?.volume = 0.5      // Inaudible due to micro-amplitude 20Hz samples; keeps CoreAudio hardware awake
      audioPlayer?.prepareToPlay()

      let playing = audioPlayer?.play() ?? false
      if playing {
        isRunning = true
        print("[TurboDownloader] Background audio keep-alive ACTIVE (44.1kHz silence loop playing)")
      } else {
        isRunning = false
        print("[TurboDownloader] audioPlayer.play() returned false, will retry")
      }
    } catch {
      isRunning = false
      print("[TurboDownloader] Background session error: \(error)")
    }
  }

  func handleDidEnterBackground() {
    startBackgroundTask()
    ensureAudioPlaying()
    startHeartbeat()
  }

  func handleDidBecomeActive() {
    endBackgroundTask()
    ensureAudioPlaying()
  }

  func startBackgroundTask() {
    if bgTask != .invalid {
      UIApplication.shared.endBackgroundTask(bgTask)
      bgTask = .invalid
    }
    bgTask = UIApplication.shared.beginBackgroundTask(withName: "TurboDownloaderBG") { [weak self] in
      self?.renewBackgroundTask()
    }
    print("[TurboDownloader] Background task asserted: \(bgTask.rawValue)")
  }

  func renewBackgroundTask() {
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      let oldTask = self.bgTask

      if self.hasActiveDownloads() {
        self.ensureAudioPlaying()
        self.bgTask = UIApplication.shared.beginBackgroundTask(withName: "TurboDownloaderBG") { [weak self] in
          self?.renewBackgroundTask()
        }
        print("[TurboDownloader] Background task renewed: \(self.bgTask.rawValue)")
      } else {
        self.bgTask = .invalid
      }

      if oldTask != .invalid {
        UIApplication.shared.endBackgroundTask(oldTask)
      }
    }
  }

  private func endBackgroundTask() {
    if bgTask != .invalid {
      let task = bgTask
      bgTask = .invalid
      UIApplication.shared.endBackgroundTask(task)
      print("[TurboDownloader] Background task ended")
    }
  }

  func ensureAudioPlaying() {
    if audioPlayer == nil || audioPlayer?.isPlaying == false {
      setupAudioSessionAndPlayer()
    }
  }

  private func startHeartbeat() {
    stopHeartbeat()
    let timer = DispatchSource.makeTimerSource(flags: [], queue: DispatchQueue.global(qos: .userInitiated))
    timer.schedule(deadline: .now() + 2.0, repeating: 2.0)
    timer.setEventHandler { [weak self] in
      self?.heartbeat()
    }
    timer.resume()
    heartbeatTimer = timer
  }

  private func stopHeartbeat() {
    heartbeatTimer?.cancel()
    heartbeatTimer = nil
  }

  private func heartbeat() {
    guard hasActiveDownloads() else { return }

    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }

      // Keep background task alive if invalid
      if self.bgTask == .invalid {
        self.startBackgroundTask()
      }

      // Check and recover audio if stopped (e.g. from third-party app media interruption)
      if self.audioPlayer == nil || self.audioPlayer?.isPlaying == false {
        do {
          let session = AVAudioSession.sharedInstance()
          try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
          try session.setActive(true)
          if self.audioPlayer == nil {
            let soundURL = self.getOrCreateSilenceURL()
            self.audioPlayer = try AVAudioPlayer(contentsOf: soundURL)
            self.audioPlayer?.delegate = self
            self.audioPlayer?.numberOfLoops = -1
            self.audioPlayer?.volume = 0.5
            self.audioPlayer?.prepareToPlay()
          }
          if self.audioPlayer?.isPlaying == false {
            self.audioPlayer?.play()
            print("[TurboDownloader] Heartbeat successfully recovered audio playback")
          }
        } catch {
          // Another app (e.g. LinkedIn / YouTube) currently has exclusive audio lock;
          // bgTask protects us until user scrolls past or audio is released.
        }
      }
    }
  }

  @objc private func handleAudioInterruption(_ notification: Notification) {
    guard let userInfo = notification.userInfo,
          let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

    if type == .began {
      print("[TurboDownloader] Audio interruption BEGAN (another app started media) - asserting background task")
      DispatchQueue.main.async { [weak self] in
        self?.startBackgroundTask()
      }
    } else if type == .ended {
      print("[TurboDownloader] Audio interruption ENDED - restoring background audio")
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        do {
          let session = AVAudioSession.sharedInstance()
          try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
          try session.setActive(true)
          self.audioPlayer?.play()
        } catch {
          print("[TurboDownloader] Failed to resume audio after interruption: \(error)")
        }
      }
    }
  }

  @objc private func handleAudioRouteChange(_ notification: Notification) {
    if audioPlayer == nil || audioPlayer?.isPlaying == false {
      DispatchQueue.main.async { [weak self] in
        guard let self = self else { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        self.audioPlayer?.play()
        print("[TurboDownloader] Resumed background keep-alive after audio route change")
      }
    }
  }

  @objc private func handleMediaServicesReset(_ notification: Notification) {
    print("[TurboDownloader] Media services reset, recreating player")
    isRunning = false
    DispatchQueue.main.async { [weak self] in
      self?.setupAudioSessionAndPlayer()
    }
  }

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    audioPlayer?.play()
  }

  func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    print("[TurboDownloader] Audio decode error: \(String(describing: error)), recreating player")
    isRunning = false
    setupAudioSessionAndPlayer()
  }

  func hasActiveDownloads() -> Bool {
    guard let docDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
      return false
    }
    let lockFile = docDir.appendingPathComponent("TurboDownloader/.active_download_lock")
    return FileManager.default.fileExists(atPath: lockFile.path)
  }

  private func getOrCreateSilenceURL() -> URL {
    // 1. Try bundle resource
    if let bundleURL = Bundle.main.url(forResource: "silence", withExtension: "wav") {
      return bundleURL
    }

    // 2. Fallback to Documents directory
    guard let docDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
      return FileManager.default.temporaryDirectory.appendingPathComponent("silence.wav")
    }
    let fileURL = docDir.appendingPathComponent("silence.wav")
    if FileManager.default.fileExists(atPath: fileURL.path) {
      return fileURL
    }

    // 3. Write standard 44.1kHz 16-bit PCM mono WAV file (2 seconds with sub-audible 20Hz micro-waveform)
    let sampleRate: Int32 = 44100
    let numChannels: Int16 = 1
    let bitsPerSample: Int16 = 16
    let numSamples: Int32 = sampleRate * 2
    let subChunk2Size: Int32 = numSamples * Int32(numChannels) * Int32(bitsPerSample / 8)
    let chunkSize: Int32 = 36 + subChunk2Size

    var data = Data()
    data.append(contentsOf: "RIFF".utf8)
    data.append(withUnsafeBytes(of: chunkSize.littleEndian) { Data($0) })
    data.append(contentsOf: "WAVE".utf8)
    data.append(contentsOf: "fmt ".utf8)
    let subChunk1Size: Int32 = 16
    let audioFormat: Int16 = 1
    let byteRate: Int32 = sampleRate * Int32(numChannels) * Int32(bitsPerSample / 8)
    let blockAlign: Int16 = numChannels * (bitsPerSample / 8)
    data.append(withUnsafeBytes(of: subChunk1Size.littleEndian) { Data($0) })
    data.append(withUnsafeBytes(of: audioFormat.littleEndian) { Data($0) })
    data.append(withUnsafeBytes(of: numChannels.littleEndian) { Data($0) })
    data.append(withUnsafeBytes(of: sampleRate.littleEndian) { Data($0) })
    data.append(withUnsafeBytes(of: byteRate.littleEndian) { Data($0) })
    data.append(withUnsafeBytes(of: blockAlign.littleEndian) { Data($0) })
    data.append(withUnsafeBytes(of: bitsPerSample.littleEndian) { Data($0) })
    data.append(contentsOf: "data".utf8)
    data.append(withUnsafeBytes(of: subChunk2Size.littleEndian) { Data($0) })

    for i in 0..<numSamples {
      let angle = 2.0 * Double.pi * 20.0 * Double(i) / Double(sampleRate)
      let sampleVal = Int16(2.0 * sin(angle))
      data.append(withUnsafeBytes(of: sampleVal.littleEndian) { Data($0) })
    }

    try? data.write(to: fileURL)
    return fileURL
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
