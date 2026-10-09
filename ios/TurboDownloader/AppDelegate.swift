import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import AVFoundation
import MediaPlayer
import UserNotifications

@main
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
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

    // Setup UNUserNotificationCenter delegate to show alerts in foreground & background
    UNUserNotificationCenter.current().delegate = self
    UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
      print("[TurboDownloader] User notification permission granted: \(granted)")
    }

    disableFileProtectionForDownloads()
    BackgroundDownloadKeeper.shared.setupRemoteCommandCenter()
    BackgroundDownloadKeeper.shared.startKeepAlive()

    return true
  }

  // Display banner notification even when app is active in foreground
  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    willPresent notification: UNNotification,
    withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
  ) {
    completionHandler([.banner, .sound, .badge, .list])
  }

  func applicationDidEnterBackground(_ application: UIApplication) {
    disableFileProtectionForDownloads()
    BackgroundDownloadKeeper.shared.handleDidEnterBackground()
  }

  func applicationDidBecomeActive(_ application: UIApplication) {
    BackgroundDownloadKeeper.shared.handleDidBecomeActive()
  }

  func disableFileProtectionForDownloads() {
    guard let docDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    let tdDir = docDir.appendingPathComponent("TurboDownloader")
    let tmpDir = FileManager.default.temporaryDirectory

    try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.none], ofItemAtPath: docDir.path)
    try? FileManager.default.createDirectory(at: tdDir, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.none])
    try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.none], ofItemAtPath: tdDir.path)
    try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.none], ofItemAtPath: tmpDir.path)

    for dir in [tdDir, tmpDir] {
      if let enumerator = FileManager.default.enumerator(atPath: dir.path) {
        for case let file as String in enumerator {
          let fullPath = dir.appendingPathComponent(file).path
          try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.none], ofItemAtPath: fullPath)
        }
      }
    }
  }
}

class BackgroundDownloadKeeper: NSObject, AVAudioPlayerDelegate {
  static let shared = BackgroundDownloadKeeper()
  private var audioPlayer: AVAudioPlayer?
  private var bgTask: UIBackgroundTaskIdentifier = .invalid
  private var heartbeatTimer: DispatchSourceTimer?
  private var isRunning = false
  private var cachedArtwork: MPMediaItemArtwork?

  func startKeepAlive() {
    setupAudioSessionAndPlayer()
    setupNotifications()
    startHeartbeat()
  }

  func setupRemoteCommandCenter() {
    UIApplication.shared.beginReceivingRemoteControlEvents()
    let commandCenter = MPRemoteCommandCenter.shared()

    commandCenter.playCommand.isEnabled = true
    commandCenter.playCommand.addTarget { [weak self] _ in
      self?.ensureAudioPlaying()
      return .success
    }

    commandCenter.pauseCommand.isEnabled = true
    commandCenter.pauseCommand.addTarget { _ in
      return .success
    }

    commandCenter.togglePlayPauseCommand.isEnabled = true
    commandCenter.togglePlayPauseCommand.addTarget { _ in
      return .success
    }
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
      // Use .playback with .mixWithOthers so other apps (LinkedIn, Instagram, Spotify, Twitter) NEVER terminate download keepalive!
      try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
      try session.setActive(true)

      let soundURL = getOrCreateSilenceURL()
      audioPlayer = try AVAudioPlayer(contentsOf: soundURL)
      audioPlayer?.delegate = self
      audioPlayer?.numberOfLoops = -1 // Continuous infinite loop
      audioPlayer?.volume = 0.5      // Inaudible 20Hz micro-sine; keeps CoreAudio hardware awake
      audioPlayer?.prepareToPlay()

      let playing = audioPlayer?.play() ?? false
      if playing {
        isRunning = true
        print("[TurboDownloader] Background audio keep-alive ACTIVE (.playback + .mixWithOthers)")
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
    if hasActiveDownloads() {
      sendLocalNotification(
        title: "TurboDownloader Active ⚡",
        body: "Your downloads are continuing smoothly in the background."
      )
    }
  }

  func handleDidBecomeActive() {
    endBackgroundTask()
    ensureAudioPlaying()
  }

  func startBackgroundTask() {
    if bgTask != .invalid {
      let task = bgTask
      bgTask = .invalid
      UIApplication.shared.endBackgroundTask(task)
    }
    bgTask = UIApplication.shared.beginBackgroundTask(withName: "TurboDownloaderBG") { [weak self] in
      guard let self = self else { return }
      let task = self.bgTask
      self.bgTask = .invalid
      if task != .invalid {
        UIApplication.shared.endBackgroundTask(task)
      }
    }
    print("[TurboDownloader] Background task asserted: \(bgTask.rawValue)")
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
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }

      // Update live Lock Screen & Dynamic Island Now Playing progress
      self.updateNowPlayingProgress()

      // Periodically refresh file permissions to guarantee locked device never blocks writes
      (UIApplication.shared.delegate as? AppDelegate)?.disableFileProtectionForDownloads()

      guard self.hasActiveDownloads() else { return }

      // Keep background task alive if invalid
      if self.bgTask == .invalid {
        self.startBackgroundTask()
      }

      // Check and recover audio if stopped
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
          print("[TurboDownloader] Audio session activation error in heartbeat: \(error)")
        }
      }
    }
  }

  func updateNowPlayingProgress() {
    guard let docDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
    let progressFile = docDir.appendingPathComponent("TurboDownloader/.active_progress.json")
    let notifyFile = docDir.appendingPathComponent("TurboDownloader/.download_complete_notify")

    // Check if a completion notification was requested
    if FileManager.default.fileExists(atPath: notifyFile.path) {
      if let data = try? Data(contentsOf: notifyFile),
         let fileName = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
         !fileName.isEmpty {
        sendLocalNotification(title: "Download Complete 🎉", body: "\(fileName) has finished downloading and is ready!")
      }
      try? FileManager.default.removeItem(at: notifyFile)
    }

    guard FileManager.default.fileExists(atPath: progressFile.path),
          let data = try? Data(contentsOf: progressFile),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      if MPNowPlayingInfoCenter.default().nowPlayingInfo != nil {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
        MPNowPlayingInfoCenter.default().playbackState = .stopped
      }
      return
    }

    let title = json["title"] as? String ?? "Downloading file..."
    let downloaded = json["downloaded"] as? Double ?? 0
    let total = json["total"] as? Double ?? 0
    let speed = json["speed"] as? Double ?? 0

    let downloadedMB = String(format: "%.1f MB", downloaded / 1048576.0)
    let totalMB = total > 0 ? String(format: "%.1f MB", total / 1048576.0) : "Calculating..."
    let speedStr = speed > 0 ? String(format: "%.1f MB/s", speed / 1048576.0) : "0 MB/s"
    let percent = total > 0 ? min(100.0, (downloaded / total) * 100.0) : 0
    let percentStr = total > 0 ? String(format: " (%.0f%%)", percent) : ""

    var info = [String: Any]()
    info[MPMediaItemPropertyTitle] = "📥 \(title)"
    info[MPMediaItemPropertyArtist] = "TurboDownloader • \(speedStr)"
    info[MPMediaItemPropertyAlbumTitle] = "\(downloadedMB) / \(totalMB)\(percentStr)"

    if total > 0 {
      info[MPMediaItemPropertyPlaybackDuration] = total
      info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = downloaded
      info[MPNowPlayingInfoPropertyPlaybackRate] = 1.0
    }

    // Generate/cache high-res retina artwork for Lock Screen and Dynamic Island
    if cachedArtwork == nil {
      let iconSize = CGSize(width: 256, height: 256)
      let renderer = UIGraphicsImageRenderer(size: iconSize)
      let artworkImage = renderer.image { ctx in
        let colors = [
          UIColor(red: 0.05, green: 0.45, blue: 0.98, alpha: 1.0).cgColor,
          UIColor(red: 0.02, green: 0.15, blue: 0.45, alpha: 1.0).cgColor
        ]
        if let gradient = CGGradient(colorsSpace: CGColorSpaceCreateDeviceRGB(), colors: colors as CFArray, locations: [0.0, 1.0]) {
          ctx.cgContext.drawLinearGradient(gradient, start: .zero, end: CGPoint(x: 0, y: iconSize.height), options: [])
        }

        let config = UIImage.SymbolConfiguration(pointSize: 100, weight: .bold)
        if let symbol = UIImage(systemName: "arrow.down.circle.fill", withConfiguration: config)?.withTintColor(.white, renderingMode: .alwaysOriginal) {
          let symRect = CGRect(
            x: (iconSize.width - symbol.size.width) / 2,
            y: (iconSize.height - symbol.size.height) / 2,
            width: symbol.size.width,
            height: symbol.size.height
          )
          symbol.draw(in: symRect)
        }
      }
      cachedArtwork = MPMediaItemArtwork(boundsSize: iconSize) { _ in artworkImage }
    }

    if let artwork = cachedArtwork {
      info[MPMediaItemPropertyArtwork] = artwork
    }

    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    MPNowPlayingInfoCenter.default().playbackState = .playing
  }

  func sendLocalNotification(title: String, body: String) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    let request = UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
    UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
  }

  @objc private func handleAudioInterruption(_ notification: Notification) {
    guard let userInfo = notification.userInfo,
          let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
          let type = AVAudioSession.InterruptionType(rawValue: typeValue) else { return }

    if type == .began {
      print("[TurboDownloader] Audio interruption BEGAN - asserting background task")
      DispatchQueue.main.async { [weak self] in
        self?.startBackgroundTask()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
          guard let self = self else { return }
          try? AVAudioSession.sharedInstance().setActive(true)
          self.audioPlayer?.play()
        }
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
    if let bundleURL = Bundle.main.url(forResource: "silence", withExtension: "wav") {
      return bundleURL
    }

    guard let docDir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else {
      return FileManager.default.temporaryDirectory.appendingPathComponent("silence.wav")
    }
    let fileURL = docDir.appendingPathComponent("silence.wav")
    if FileManager.default.fileExists(atPath: fileURL.path) {
      return fileURL
    }

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
